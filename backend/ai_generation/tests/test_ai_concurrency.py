"""AI writes next to other people's writes (QA-029, QA-030) and who may regenerate a page (D1)."""
import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.db import connection
from rest_framework import status
from rest_framework.test import APIClient

from collaboration.locks import get_lock_manager
from pages.models import Block, Page, PageVersion
from tests.factories import BlockFactory, PageFactory, UserFactory

GET_PLAN = 'billing.permissions.get_user_plan'
RESOLVE_PROVIDER = 'ai_generation.views.resolve_provider'
CALL_AI = 'ai_generation.providers.call_ai'

HERO = {'title': 'Old title', 'subtitle': 'Old subtitle', 'buttonText': 'Go', 'backgroundImage': '', 'alignment': 'center'}
GENERATED = [{'type': 'hero', 'data': {**HERO, 'title': 'Generated'}}, {'type': 'cta', 'data': {'title': 'Join', 'buttonText': 'Go'}}]


@pytest.fixture(autouse=True)
def live_mode(settings):
    settings.AI_DEMO_MODE = False


@pytest.fixture(autouse=True)
def provider():
    plan = SimpleNamespace(
        name='pro', display_name='Pro', max_pages=100, max_version_history=50, max_ai_generations_per_hour=100,
        has_custom_domain=True, has_analytics=True, remove_watermark=True,
    )
    with patch(GET_PLAN, return_value=plan), patch(RESOLVE_PROVIDER, return_value=('anthropic', 'k', True)):
        yield


def reply(payload):
    return SimpleNamespace(text=json.dumps(payload), tokens_in=1, tokens_out=1)


def edit_url(page, block):
    return f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/'


# --- QA-030 ------------------------------------------------------------------

@pytest.mark.django_db
class TestEditBlockWhileSomeoneElseSaves:
    def test_a_save_made_while_the_model_answers_is_not_overwritten(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)

        def model_answers_after_someone_saves(*args, **kwargs):
            # The "PUT" of a collaborator, while the provider call is running
            Block.objects.filter(pk=block.pk).update(data={**HERO, 'title': 'Typed by a collaborator'})
            return reply({'type': 'hero', 'data': {**HERO, 'title': 'From the AI'}})

        with patch(CALL_AI, side_effect=model_answers_after_someone_saves):
            response = auth_client.post(edit_url(page, block), {'instruction': 'Change the title'}, format='json')

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data['code'] == 'BLOCK_CHANGED'
        block.refresh_from_db()
        assert block.data['title'] == 'Typed by a collaborator'
        assert not PageVersion.objects.filter(page=page).exists()  # nothing was snapshotted or applied
        assert Page.objects.get(pk=page.pk).version == page.version

    def test_the_save_goes_through_the_api_too(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)

        def model_answers_after_a_put(*args, **kwargs):
            saved = auth_client.put(f'/api/pages/{page.id}/', {
                'name': page.name, 'version': page.version, 'blocks': [
                    {'id': str(block.id), 'type': 'hero', 'order': 0, 'data': {**HERO, 'title': 'Saved'}, 'styles': {}},
                ],
            }, format='json')
            assert saved.status_code == 200, saved.data
            return reply({'type': 'hero', 'data': {**HERO, 'title': 'From the AI'}})

        with patch(CALL_AI, side_effect=model_answers_after_a_put):
            response = auth_client.post(edit_url(page, block), {'instruction': 'Change the title'}, format='json')

        assert response.status_code == status.HTTP_409_CONFLICT
        block.refresh_from_db()
        assert block.data['title'] == 'Saved'

    def test_a_block_deleted_meanwhile_is_a_404_not_a_500(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)

        def model_answers_after_a_delete(*args, **kwargs):
            Block.objects.filter(pk=block.pk).delete()
            return reply({'type': 'hero', 'data': HERO})

        with patch(CALL_AI, side_effect=model_answers_after_a_delete):
            response = auth_client.post(edit_url(page, block), {'instruction': 'x'}, format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_an_untouched_block_is_edited_as_before(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)

        with patch(CALL_AI, return_value=reply({'type': 'hero', 'data': {**HERO, 'title': 'From the AI'}})):
            response = auth_client.post(edit_url(page, block), {'instruction': 'Change the title'}, format='json')

        assert response.status_code == status.HTTP_200_OK
        block.refresh_from_db()
        assert block.data['title'] == 'From the AI'
        assert PageVersion.objects.filter(page=page, trigger='auto_ai_generation').count() == 1

    def test_a_block_locked_by_another_connection_is_refused_before_calling_the_model(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)
        manager = get_lock_manager()
        assert manager.acquire(str(page.id), str(block.id), 'their-connection')
        try:
            with patch(CALL_AI) as call:
                response = auth_client.post(
                    edit_url(page, block), {'instruction': 'x'}, format='json', HTTP_X_CONNECTION_ID='my-connection',
                )
            assert response.status_code == status.HTTP_409_CONFLICT
            assert response.data['code'] == 'BLOCK_LOCKED'
            call.assert_not_called()
        finally:
            manager.release(str(page.id), str(block.id), 'their-connection')

    def test_the_connection_that_holds_the_lock_may_edit(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)
        manager = get_lock_manager()
        assert manager.acquire(str(page.id), str(block.id), 'my-connection')
        try:
            with patch(CALL_AI, return_value=reply({'type': 'hero', 'data': {**HERO, 'title': 'Mine'}})):
                response = auth_client.post(
                    edit_url(page, block), {'instruction': 'x'}, format='json', HTTP_X_CONNECTION_ID='my-connection',
                )
            assert response.status_code == status.HTTP_200_OK
        finally:
            manager.release(str(page.id), str(block.id), 'my-connection')


# --- D1 ----------------------------------------------------------------------

@pytest.mark.django_db
class TestOnlyTheOwnerRegeneratesThePage:
    def test_a_collaborator_cannot_and_nothing_is_replaced(self):
        owner, collaborator = UserFactory(), UserFactory()
        page = PageFactory(owner=owner)
        block = BlockFactory(page=page, type='hero', order=0, data=HERO)
        page.collaborators.add(collaborator)
        client = APIClient()
        client.force_authenticate(user=collaborator)

        with patch(CALL_AI) as call:
            response = client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A bakery'}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'NOT_OWNER'
        call.assert_not_called()
        assert list(page.blocks.values_list('id', flat=True)) == [block.id]

    def test_the_owner_can(self, auth_client, user):
        page = PageFactory(owner=user)
        with patch(CALL_AI, return_value=reply(GENERATED)):
            response = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A bakery'}, format='json')
        assert response.status_code == status.HTTP_200_OK


# --- QA-029 ------------------------------------------------------------------

@pytest.mark.django_db
class TestGenerationIsOneAtATime:
    def test_generate_replaces_the_blocks_and_bumps_the_version_in_one_step(self, auth_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='hero', order=0, data=HERO)
        BlockFactory(page=page, type='cta', order=1, data={'title': 'Old'})

        with patch(CALL_AI, return_value=reply(GENERATED)):
            response = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A bakery'}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert page.blocks.count() == 2
        assert response.data['version'] == Page.objects.get(pk=page.pk).version == page.version + 1
        assert PageVersion.objects.filter(page=page, trigger='auto_ai_generation').count() == 1

    def test_a_failure_while_writing_leaves_the_old_blocks(self, auth_client, user):
        page = PageFactory(owner=user)
        old = BlockFactory(page=page, type='hero', order=0, data=HERO)

        with patch(CALL_AI, return_value=reply(GENERATED)), \
                patch('ai_generation.views.Block.objects.create', side_effect=RuntimeError('boom')):
            with pytest.raises(RuntimeError):
                auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A bakery'}, format='json')

        assert list(page.blocks.values_list('id', flat=True)) == [old.id]


@pytest.mark.skipif(connection.vendor != 'postgresql', reason='row locks: runs on the PostgreSQL job')
@pytest.mark.django_db(transaction=True)
def test_four_generations_at_once_give_one_fixture_and_no_500():
    owner = UserFactory()
    page = PageFactory(owner=owner)
    BlockFactory(page=page, type='hero', order=0, data=HERO)
    statuses = []
    real_create = Block.objects.create

    def slow_create(**kwargs):
        time.sleep(0.03)  # widens the window in which two generations used to interleave
        return real_create(**kwargs)

    def generate():
        try:
            client = APIClient()
            client.force_authenticate(user=owner)
            statuses.append(
                client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A bakery'}, format='json').status_code
            )
        finally:
            connection.close()

    with patch(CALL_AI, return_value=reply(GENERATED)), patch.object(Block.objects, 'create', side_effect=slow_create):
        threads = [threading.Thread(target=generate) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

    assert statuses == [200, 200, 200, 200]
    assert Block.objects.filter(page=page).count() == len(GENERATED)
    numbers = list(PageVersion.objects.filter(page=page).values_list('version_number', flat=True))
    assert sorted(numbers) == [1, 2, 3, 4]

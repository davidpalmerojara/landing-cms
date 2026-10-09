"""Optimistic concurrency on pages (ADR-024): version, 409, replace semantics, notifications."""
import logging
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.db.models import F
from rest_framework import status
from rest_framework.test import APIClient

from pages import sync
from pages.models import Block, Page
from pages.serializers import PageDetailSerializer
from tests.factories import BlockFactory, PageFactory, PageVersionFactory, UserFactory

GET_PLAN = 'billing.permissions.get_user_plan'
SEND = 'pages.sync._send_to_page_group'


def mock_plan():
    return SimpleNamespace(
        name='pro', display_name='Pro', max_pages=100, max_version_history=50, max_ai_generations_per_hour=10,
        has_custom_domain=True, has_analytics=True, remove_watermark=True, has_collaboration=True,
    )


@pytest.fixture(autouse=True)
def plan():
    with patch(GET_PLAN, return_value=mock_plan()):
        yield


def url(page):
    return f'/api/pages/{page.id}/'


def put(client, page, **fields):
    body = {'name': page.name, 'blocks': [], **fields}
    return client.put(url(page), body, format='json')


pytestmark = pytest.mark.django_db


class TestVersionField:
    def test_new_pages_start_at_version_one_and_it_is_exposed(self, auth_client, page):
        assert page.version == 1
        assert auth_client.get(url(page)).data['version'] == 1
        listed = auth_client.get('/api/pages/').data['results']
        assert listed[0]['version'] == 1

    def test_creating_through_the_api_ignores_a_version_in_the_payload(self, auth_client):
        resp = auth_client.post('/api/pages/', {'name': 'Nueva', 'blocks': [], 'version': 99}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['version'] == 1

    def test_duplicate_starts_again_at_one(self, auth_client, page):
        Page.objects.filter(pk=page.pk).update(version=7)
        resp = auth_client.post(f'/api/pages/{page.id}/duplicate/')
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['version'] == 1


class TestSavingWithAVersion:
    @pytest.mark.parametrize('version', [None, 'abc', True, 1.5, [1], {'a': 1}, '', '-1'])
    def test_version_is_required_and_must_be_an_integer(self, auth_client, page, version):
        body = {'name': 'X', 'blocks': []}
        if version is not None:
            body['version'] = version
        resp = auth_client.put(url(page), body, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'VERSION_REQUIRED'
        page.refresh_from_db()
        assert page.name != 'X'

    def test_patch_needs_the_version_too(self, auth_client, page):
        resp = auth_client.patch(url(page), {'name': 'X'}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'VERSION_REQUIRED'

    def test_a_save_bumps_the_version_and_returns_it(self, auth_client, page):
        resp = put(auth_client, page, name='Nuevo', version=1)

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['version'] == 2
        page.refresh_from_db()
        assert (page.version, page.name) == (2, 'Nuevo')

    def test_consecutive_saves_each_need_the_latest_version(self, auth_client, page):
        assert put(auth_client, page, name='A', version=1).data['version'] == 2
        assert put(auth_client, page, name='B', version=2).data['version'] == 3
        assert put(auth_client, page, name='C', version=2).status_code == status.HTTP_409_CONFLICT

    def test_string_version_from_a_form_is_accepted(self, auth_client, page):
        resp = auth_client.put(url(page), {'name': 'X', 'blocks': [], 'version': '1'}, format='json')
        assert resp.status_code == status.HTTP_200_OK

    def test_a_collaborator_saves_with_the_same_rules(self, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        client = APIClient()
        client.force_authenticate(collaborator)

        assert put(client, page, version=1).status_code == status.HTTP_200_OK
        assert put(client, page, version=1).status_code == status.HTTP_409_CONFLICT

    def test_a_stranger_gets_404_before_any_version_talk(self, page):
        client = APIClient()
        client.force_authenticate(UserFactory())
        assert put(client, page, version=1).status_code == status.HTTP_404_NOT_FOUND


class TestConflict:
    def test_a_stale_save_gets_409_with_the_current_page_and_changes_nothing(self, auth_client, page):
        hero = BlockFactory(page=page, type='hero', order=0, data={'title': 'Servidor'})
        assert put(auth_client, page, name='Otro editor', version=1, blocks=[
            {'id': str(hero.id), 'type': 'hero', 'order': 0, 'data': {'title': 'Servidor'}, 'styles': {}},
        ]).status_code == status.HTTP_200_OK

        resp = put(auth_client, page, name='Mi version', version=1, blocks=[])

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.data['code'] == 'VERSION_CONFLICT'
        assert resp.data['error']
        current = resp.data['page']
        assert current['version'] == 2
        assert current['name'] == 'Otro editor'
        assert [b['id'] for b in current['blocks']] == [str(hero.id)]
        page.refresh_from_db()
        assert (page.name, page.version, page.blocks.count()) == ('Otro editor', 2, 1)

    def test_a_version_from_the_future_is_a_conflict_too(self, auth_client, page):
        assert put(auth_client, page, version=5).status_code == status.HTTP_409_CONFLICT

    def test_a_stale_invalid_payload_is_reported_as_a_conflict_not_a_validation_error(self, auth_client, page):
        Page.objects.filter(pk=page.pk).update(version=3)
        resp = put(auth_client, page, version=1, blocks=[{'type': 'nope', 'data': {}, 'styles': {}}])
        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_the_conflict_response_does_not_leak_other_peoples_pages(self, auth_client, page):
        other = PageFactory(owner=UserFactory())
        resp = auth_client.put(url(other), {'name': 'X', 'blocks': [], 'version': 1}, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert 'page' not in resp.data

    def test_a_save_that_loses_the_race_after_validation_is_refused(self, auth_client, page):
        """Another request commits between our read and our write: only one of the two wins."""
        original = PageDetailSerializer.validate_blocks

        def validate_then_lose_the_race(serializer, blocks):
            result = original(serializer, blocks)
            Page.objects.filter(pk=page.pk).update(version=F('version') + 1, name='Ganador')
            return result

        with patch.object(PageDetailSerializer, 'validate_blocks', validate_then_lose_the_race):
            resp = put(auth_client, page, name='Perdedor', version=1)

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.data['page']['name'] == 'Ganador'
        page.refresh_from_db()
        assert (page.name, page.version) == ('Ganador', 2)

    def test_of_two_claims_with_the_same_version_exactly_one_succeeds(self, page):
        winners = 0
        for _ in range(2):
            try:
                sync.claim_version(page, 1)
                winners += 1
            except sync.VersionConflict:
                pass
        page.refresh_from_db()
        assert winners == 1
        assert page.version == 2

    def test_a_save_does_not_write_back_a_stale_version(self, auth_client, page):
        """The serializer saves the whole instance: it must carry the bumped version."""
        put(auth_client, page, version=1)
        page.refresh_from_db()
        assert page.version == 2


@pytest.mark.django_db(transaction=True)
def test_two_simultaneous_saves_with_the_same_version_one_wins():
    """Real threads against the real database."""
    import threading
    from django.db import OperationalError, connection

    page = PageFactory(owner=UserFactory())
    barrier = threading.Barrier(2)
    results = []

    def attempt():
        try:
            barrier.wait()
            sync.claim_version(Page.objects.get(pk=page.pk), 1)
            results.append('won')
        except sync.VersionConflict:
            results.append('conflict')
        except OperationalError:  # SQLite refuses a concurrent writer instead of waiting
            results.append('conflict')
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(results) == ['conflict', 'won']
    assert Page.objects.get(pk=page.pk).version == 2


class TestBlockDataIsReplaced:
    def test_a_key_the_editor_removed_is_really_removed(self, auth_client, page):
        block = BlockFactory(page=page, type='hero', order=0, data={'title': 'T', 'subtitle': 'S', 'badgeText': 'B'})

        resp = put(auth_client, page, version=1, blocks=[
            {'id': str(block.id), 'type': 'hero', 'order': 0, 'data': {'title': 'T2'}, 'styles': {}},
        ])

        assert resp.status_code == status.HTTP_200_OK
        block.refresh_from_db()
        assert block.data == {'title': 'T2'}
        assert resp.data['blocks'][0]['data'] == {'title': 'T2'}

    def test_blocks_missing_from_the_payload_are_deleted(self, auth_client, page):
        keep = BlockFactory(page=page, type='hero', order=0)
        drop = BlockFactory(page=page, type='cta', order=1)

        put(auth_client, page, version=1, blocks=[
            {'id': str(keep.id), 'type': 'hero', 'order': 0, 'data': {}, 'styles': {}},
        ])

        assert list(page.blocks.values_list('id', flat=True)) == [keep.id]
        assert not Block.objects.filter(pk=drop.pk).exists()


class TestEveryWriteBumpsAndNotifies:
    def test_save(self, auth_client, user, page):
        with patch(SEND) as send:
            put(auth_client, page, version=1)

        page_id, message = send.call_args.args
        assert page_id == page.pk
        assert message == {
            'type': 'page.updated', 'version': 2, 'reason': 'save',
            'by': {'user_id': str(user.pk), 'username': user.username}, 'connection_id': None,
        }

    def test_the_connection_id_header_is_passed_on(self, auth_client, page):
        with patch(SEND) as send:
            auth_client.put(url(page), {'name': 'X', 'blocks': [], 'version': 1}, format='json',
                            HTTP_X_CONNECTION_ID='conn-abc')
        assert send.call_args.args[1]['connection_id'] == 'conn-abc'

    def test_a_refused_save_does_not_notify(self, auth_client, page):
        with patch(SEND) as send:
            put(auth_client, page, version=9)
            put(auth_client, page)  # no version
        send.assert_not_called()

    def test_publish_and_unpublish(self, auth_client, page):
        BlockFactory(page=page)
        with patch(SEND) as send:
            published = auth_client.post(f'/api/pages/{page.id}/publish/')
            assert published.data['version'] == 2
            unpublished = auth_client.post(f'/api/pages/{page.id}/unpublish/')
            assert unpublished.data['version'] == 3

        assert [c.args[1]['reason'] for c in send.call_args_list] == ['publish', 'publish']
        assert [c.args[1]['version'] for c in send.call_args_list] == [2, 3]

    def test_restore(self, auth_client, user, page):
        BlockFactory(page=page, type='hero', order=0, data={'title': 'Actual'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            {'type': 'cta', 'order': 0, 'data': {'title': 'Antigua'}, 'styles': {}},
        ])

        with patch(SEND) as send:
            resp = auth_client.post(f'/api/pages/{page.id}/versions/{version.id}/restore/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['version'] == 2
        assert send.call_args.args[1]['reason'] == 'restore'
        assert send.call_args.args[1]['version'] == 2

    def test_restore_with_metadata_does_not_overwrite_the_bumped_version(self, auth_client, user, page):
        version = PageVersionFactory(page=page, created_by=user, snapshot=[], page_metadata={'name': 'Nombre viejo'})
        resp = auth_client.post(f'/api/pages/{page.id}/versions/{version.id}/restore/?restore_metadata=true')
        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert (page.name, page.version) == ('Nombre viejo', 2)

    def test_a_failing_broadcast_does_not_fail_the_write(self, auth_client, page, caplog):
        with patch(SEND, side_effect=ConnectionError('redis down')), caplog.at_level(logging.WARNING, logger='pages.sync'):
            resp = put(auth_client, page, name='Guardado', version=1)

        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert (page.name, page.version) == ('Guardado', 2)
        assert 'Failed to broadcast page_updated' in caplog.text

    def test_without_a_channel_layer_nothing_breaks(self, auth_client, page):
        with patch('pages.sync.get_channel_layer', return_value=None):
            assert put(auth_client, page, version=1).status_code == status.HTTP_200_OK

    def test_unshare_notifies_the_removed_user(self, auth_client, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        with patch(SEND) as send:
            resp = auth_client.post(f'/api/pages/{page.id}/unshare/', {'user_id': str(collaborator.pk)}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert send.call_args.args == (page.pk, {'type': 'access.revoked', 'user_id': str(collaborator.pk)})


class TestAIWrites:
    PAGE_JSON = '[{"type":"hero","data":{"title":"Hola","subtitle":"Mundo","buttonText":"Empezar","backgroundImage":"","alignment":"center"}}]'

    @pytest.fixture(autouse=True)
    def live_mode(self, settings):
        settings.AI_DEMO_MODE = False

    def test_generate_bumps_notifies_and_reports_the_version(self, auth_client, user, page):
        with patch('ai_generation.views.resolve_provider', return_value=('anthropic', 'k', True)), \
                patch('ai_generation.providers.call_ai') as call_ai, patch(SEND) as send:
            call_ai.return_value = SimpleNamespace(text=self.PAGE_JSON, tokens_in=1, tokens_out=1)
            resp = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'Una cafeteria'}, format='json',
                                    HTTP_X_CONNECTION_ID='c1')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['version'] == 2
        message = send.call_args.args[1]
        assert (message['reason'], message['version'], message['connection_id']) == ('ai', 2, 'c1')
        page.refresh_from_db()
        assert page.version == 2

    def test_edit_block_bumps_and_notifies(self, auth_client, user, page, settings):
        settings.AI_DEMO_MODE = True
        block = BlockFactory(page=page, type='hero', order=0, data={'title': 'Hola'})
        with patch(SEND) as send:
            resp = auth_client.post(f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/',
                                    {'instruction': 'Hazlo mas corto'}, format='json')

        assert resp.status_code == status.HTTP_200_OK, resp.data
        assert resp.data['version'] == 2
        assert send.call_args.args[1]['reason'] == 'ai'
        page.refresh_from_db()
        assert page.version == 2

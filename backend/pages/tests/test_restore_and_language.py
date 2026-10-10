"""Restore keeps block ids (QA-012), og_type is limited (QA-009), pages have a language (D12)."""
import uuid
from unittest.mock import patch

import pytest
from rest_framework import status

from pages.models import Block, Page
from tests.factories import BlockFactory, PageFactory, PageVersionFactory


class ProPlan:
    name = 'pro'
    display_name = 'Pro'
    max_pages = -1
    max_version_history = -1
    has_custom_domain = True
    has_analytics = True
    remove_watermark = True


@pytest.fixture(autouse=True)
def pro_plan():
    with patch('billing.permissions.get_user_plan', return_value=ProPlan()):
        yield


def snapshot_block(block_id, title, order=0):
    return {'id': str(block_id), 'type': 'hero', 'order': order, 'data': {'title': title}, 'styles': {}}


def restore(client, page, version, **params):
    query = ''.join(f'?{key}={value}' for key, value in params.items())
    return client.post(f'/api/pages/{page.id}/versions/{version.id}/restore/{query}')


# --- QA-012 ------------------------------------------------------------------

@pytest.mark.django_db
class TestRestoreKeepsBlockIds:
    def test_restored_blocks_have_the_ids_of_the_snapshot(self, auth_client, user):
        page = PageFactory(owner=user)
        keep, other = uuid.uuid4(), uuid.uuid4()
        BlockFactory(page=page, type='hero', order=0, data={'title': 'Now'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            snapshot_block(keep, 'A', 0), snapshot_block(other, 'B', 1),
        ])

        assert restore(auth_client, page, version).status_code == status.HTTP_200_OK

        assert list(page.blocks.order_by('order').values_list('id', flat=True)) == [keep, other]

    def test_a_block_that_exists_now_and_in_the_snapshot_keeps_its_id(self, auth_client, user):
        page = PageFactory(owner=user)
        current = BlockFactory(page=page, type='hero', order=0, data={'title': 'Edited by someone'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[snapshot_block(current.id, 'Old')])

        restore(auth_client, page, version)

        block = page.blocks.get()
        assert block.id == current.id
        assert block.data == {'title': 'Old'}

    def test_an_id_that_belongs_to_another_page_gets_a_new_one(self, auth_client, user):
        page = PageFactory(owner=user)
        foreign = BlockFactory(page=PageFactory(), type='hero', data={'title': 'Not yours'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[snapshot_block(foreign.id, 'A')])

        response = restore(auth_client, page, version)

        assert response.status_code == status.HTTP_200_OK
        restored = page.blocks.get()
        assert restored.id != foreign.id
        foreign.refresh_from_db()
        assert foreign.data == {'title': 'Not yours'}

    def test_repeated_missing_and_malformed_ids_get_new_ones(self, auth_client, user):
        page = PageFactory(owner=user)
        twice = uuid.uuid4()
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            snapshot_block(twice, 'A', 0),
            snapshot_block(twice, 'B', 1),
            {'type': 'hero', 'order': 2, 'data': {'title': 'C'}, 'styles': {}},
            snapshot_block('not-a-uuid', 'D', 3),
        ])

        assert restore(auth_client, page, version).status_code == status.HTTP_200_OK

        ids = list(page.blocks.order_by('order').values_list('id', flat=True))
        assert len(set(ids)) == 4
        assert ids[0] == twice

    def test_restoring_twice_in_a_row_works(self, auth_client, user):
        page = PageFactory(owner=user)
        block_id = uuid.uuid4()
        version = PageVersionFactory(page=page, created_by=user, snapshot=[snapshot_block(block_id, 'A')])
        assert restore(auth_client, page, version).status_code == status.HTTP_200_OK
        assert restore(auth_client, page, version).status_code == status.HTTP_200_OK
        assert Block.objects.filter(page=page).count() == 1

    def test_the_merge_of_a_local_edit_sees_one_block(self, auth_client, user):
        """What the client sees: after the restore, the block a collaborator was
        editing has the same id as before, so it can merge instead of duplicating."""
        page = PageFactory(owner=user)
        edited_locally = BlockFactory(page=page, type='hero', order=0, data={'title': 'v1'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[snapshot_block(edited_locally.id, 'v1')])

        response = restore(auth_client, page, version)

        assert [b['id'] for b in response.data['blocks']] == [str(edited_locally.id)]


# --- QA-009 ------------------------------------------------------------------

@pytest.mark.django_db
class TestOgType:
    @pytest.mark.parametrize('value', ['website', 'article'])
    def test_accepted(self, auth_client, page, value):
        response = auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': [], 'og_type': value, 'version': page.version},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['og_type'] == value

    @pytest.mark.parametrize('value', ['product', 'video.movie', 'music.song', 'profile', 'x' * 60])
    def test_other_types_are_rejected(self, auth_client, page, value):
        response = auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': [], 'og_type': value, 'version': page.version},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'og_type' in response.data['details']

    def test_restoring_an_old_version_with_a_removed_type_falls_back_to_website(self, auth_client, user):
        page = PageFactory(owner=user)
        version = PageVersionFactory(page=page, created_by=user, snapshot=[], page_metadata={'og_type': 'product'})
        restore(auth_client, page, version, restore_metadata='true')
        page.refresh_from_db()
        assert page.og_type == 'website'


# --- D12 ---------------------------------------------------------------------

@pytest.mark.django_db
class TestPageLanguage:
    def test_a_new_page_defaults_to_spanish(self, auth_client):
        response = auth_client.post('/api/pages/', {'name': 'P', 'blocks': []}, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['language'] == 'es'

    def test_a_page_is_created_in_the_given_language(self, auth_client):
        response = auth_client.post('/api/pages/', {'name': 'P', 'language': 'en', 'blocks': []}, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert Page.objects.get(pk=response.data['id']).language == 'en'

    def test_it_is_editable_and_shown_in_the_detail_and_the_list(self, auth_client, page):
        response = auth_client.put(
            f'/api/pages/{page.id}/',
            {'name': page.name, 'blocks': [], 'language': 'pt-BR', 'version': page.version}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['language'] == 'pt-BR'
        assert auth_client.get(f'/api/pages/{page.id}/').data['language'] == 'pt-BR'
        listed = auth_client.get('/api/pages/').data['results']
        assert listed[0]['language'] == 'pt-BR'

    @pytest.mark.parametrize('value', ['', 'english', 'EN', 'e', 'es_ES', 'es-', '<script>', 'es"onload=x', 'a' * 20])
    def test_invalid_tags_are_rejected(self, auth_client, page, value):
        response = auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': [], 'language': value, 'version': page.version},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'language' in response.data['details']

    def test_the_published_snapshot_metadata_has_it_and_the_public_endpoint_serves_it(self, auth_client, page, api_client):
        auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': [], 'language': 'en', 'version': page.version},
            format='json',
        )
        auth_client.post(f'/api/pages/{page.id}/publish/')
        page.refresh_from_db()
        assert page.published_version.page_metadata['language'] == 'en'

        public = api_client.get(f'/api/public/pages/{page.slug}/')
        assert public.status_code == status.HTTP_200_OK
        assert public.data['language'] == 'en'

    def test_the_public_page_keeps_the_language_it_was_published_with(self, auth_client, page, api_client):
        auth_client.post(f'/api/pages/{page.id}/publish/')
        page.refresh_from_db()
        auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': [], 'language': 'fr', 'version': page.version},
            format='json',
        )
        assert api_client.get(f'/api/public/pages/{page.slug}/').data['language'] == 'es'

    def test_a_snapshot_without_language_falls_back_to_the_page(self, api_client):
        page = PageFactory(language='es')
        version = PageVersionFactory(page=page, snapshot=[], page_metadata={'name': 'x'})
        page.published_version = version
        page.status = Page.Status.PUBLISHED
        page.save()
        assert api_client.get(f'/api/public/pages/{page.slug}/').data['language'] == 'es'

    def test_a_duplicate_keeps_the_language(self, auth_client, user):
        page = PageFactory(owner=user, language='en')
        with patch('billing.permissions.check_page_limit'):
            copy = auth_client.post(f'/api/pages/{page.id}/duplicate/')
        assert copy.data['language'] == 'en'

    def test_restoring_metadata_brings_the_language_back(self, auth_client, user):
        page = PageFactory(owner=user, language='fr')
        version = PageVersionFactory(page=page, created_by=user, snapshot=[], page_metadata={'language': 'en'})
        restore(auth_client, page, version, restore_metadata='true')
        page.refresh_from_db()
        assert page.language == 'en'

    def test_restoring_a_bad_language_from_an_old_snapshot_falls_back_to_the_default(self, auth_client, user):
        page = PageFactory(owner=user, language='en')
        version = PageVersionFactory(page=page, created_by=user, snapshot=[], page_metadata={'language': '<x>'})
        restore(auth_client, page, version, restore_metadata='true')
        page.refresh_from_db()
        assert page.language == 'es'

    def test_existing_pages_are_spanish_by_default(self):
        assert PageFactory().language == 'es'

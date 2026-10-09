"""Restoring a version goes through the same validation as saving a page."""
from unittest.mock import patch

import pytest
from django.core.management import call_command
from rest_framework import status

from pages.block_validators import clean_block_data
from pages.management.commands.seed import SAMPLE_BLOCKS
from pages.models import Page
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

GET_PLAN = 'billing.permissions.get_user_plan'


class MockPlan:
    name = 'pro'
    display_name = 'Pro'
    max_pages = 100
    max_version_history = 50
    has_custom_domain = True
    remove_watermark = True


def restore_url(page, version):
    return f'/api/pages/{page.id}/versions/{version.id}/restore/'


@pytest.fixture(autouse=True)
def plan():
    with patch(GET_PLAN, return_value=MockPlan()):
        yield


@pytest.mark.django_db
class TestRestoreValidatesBlocks:
    def test_valid_arrays_are_restored(self, auth_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='hero', order=0, data={'title': 'Current'})
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            {'type': 'faq', 'order': 0, 'styles': {'paddingTop': '4'},
             'data': {'title': 'FAQ', 'questions': [{'question': 'Q', 'answer': 'A'}]}},
        ])

        resp = auth_client.post(restore_url(page, version))

        assert resp.status_code == status.HTTP_200_OK
        block = page.blocks.get()
        assert block.type == 'faq'
        assert block.data == {'title': 'FAQ', 'questions': [{'question': 'Q', 'answer': 'A'}]}
        assert block.styles == {'paddingTop': '4'}

    def test_restored_data_is_sanitized(self, auth_client, user):
        page = PageFactory(owner=user)
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            {'type': 'features', 'order': 0, 'styles': {}, 'data': {
                'features': [{'title': 'Fast', 'description': '<script>alert(1)</script><strong>ok</strong>', 'junk': 1}],
                'onload': 'alert(1)',
            }},
        ])

        resp = auth_client.post(restore_url(page, version))

        assert resp.status_code == status.HTTP_200_OK
        assert page.blocks.get().data == {'features': [{'title': 'Fast', 'description': 'alert(1)<strong>ok</strong>'}]}

    def test_old_numbered_keys_in_a_snapshot_are_not_brought_back(self, auth_client, user):
        # The migration converts snapshots; whatever slips through is dropped like any unknown key
        page = PageFactory(owner=user)
        version = PageVersionFactory(page=page, created_by=user, snapshot=[
            {'type': 'faq', 'order': 0, 'styles': {}, 'data': {'title': 'FAQ', 'q1': 'Q', 'a1': 'A'}},
        ])

        resp = auth_client.post(restore_url(page, version))

        assert resp.status_code == status.HTTP_200_OK
        assert page.blocks.get().data == {'title': 'FAQ'}

    @pytest.mark.parametrize('bad_block', [
        {'type': 'navbar', 'order': 0, 'styles': {},
         'data': {'links': [{'label': 'Go', 'url': 'javascript:alert(1)'}]}},
        {'type': 'faq', 'order': 0, 'styles': {}, 'data': {'questions': 'not a list'}},
        {'type': 'team', 'order': 0, 'styles': {}, 'data': {'members': [{'image': 'javascript:alert(1)'}]}},
        {'type': 'features', 'order': 0, 'styles': {}, 'data': {'features': [{}] * 7}},
        {'type': 'notABlock', 'order': 0, 'styles': {}, 'data': {}},
        {'order': 0, 'styles': {}, 'data': {}},
        {'type': 'hero', 'order': 0, 'styles': {}, 'data': 'text'},
    ])
    def test_invalid_snapshot_is_refused_and_nothing_changes(self, auth_client, user, bad_block):
        page = PageFactory(owner=user)
        current = BlockFactory(page=page, type='hero', order=0, data={'title': 'Current'})
        good = {'type': 'hero', 'order': 0, 'styles': {}, 'data': {'title': 'Restored'}}
        version = PageVersionFactory(page=page, created_by=user, snapshot=[good, bad_block])

        resp = auth_client.post(restore_url(page, version))

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert resp.data['code'] == 'INVALID_VERSION_DATA'
        assert 'bloque 2' in resp.data['error']
        assert list(page.blocks.values_list('id', flat=True)) == [current.id]
        current.refresh_from_db()
        assert current.data == {'title': 'Current'}
        # No "before restoring" safety version either: nothing was touched
        assert page.versions.count() == 1

    def test_owner_filtering_still_applies(self, api_client):
        stranger = PageFactory()
        version = PageVersionFactory(page=stranger, snapshot=[])
        api_client.force_authenticate(user=PageFactory().owner)

        resp = api_client.post(restore_url(stranger, version))

        assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


@pytest.mark.django_db
class TestSeed:
    def test_sample_blocks_are_valid_in_the_current_shapes(self):
        # Nothing is dropped or rewritten: the sample is exactly what the editor stores
        for block in SAMPLE_BLOCKS:
            assert clean_block_data(block['type'], block['data']) == block['data']

    def test_seed_command_creates_a_page_whose_blocks_are_already_clean(self):
        call_command('seed')

        page = Page.objects.get(slug='sample-landing')
        blocks = list(page.blocks.order_by('order'))
        assert [b.type for b in blocks] == [b['type'] for b in SAMPLE_BLOCKS]
        for block in blocks:
            assert clean_block_data(block.type, block.data) == block.data
        features = next(b for b in blocks if b.type == 'features')
        assert features.data['features'][0] == {
            'title': 'Visual Editor', 'description': 'Drag and drop blocks to build your page.',
        }

    def test_seed_twice_does_not_duplicate(self):
        call_command('seed')
        call_command('seed')
        assert Page.objects.filter(slug='sample-landing').count() == 1
        assert Page.objects.get(slug='sample-landing').blocks.count() == len(SAMPLE_BLOCKS)

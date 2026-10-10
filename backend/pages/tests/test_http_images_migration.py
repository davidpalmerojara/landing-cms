"""SEC3-001: migration 0019 rewrites stored http:// image URLs to https://.

A page saved before the https-only image rule kept refusing every save and
every version restore. The migration removes that legacy state in blocks,
every snapshot (the published one included) and og_image.
"""
import copy
import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from pages.block_validators import clean_block_data
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

migration = importlib.import_module('pages.migrations.0019_http_images_to_https')


@pytest.mark.parametrize(('stored', 'expected'), [
    ('http://example.com/a.png', 'https://example.com/a.png'),
    ('HTTP://example.com/a.png', 'https://example.com/a.png'),
    ('http://localhost:3000/media/a.png?x=1#y', 'https://localhost:3000/media/a.png?x=1#y'),
    ('https://example.com/a.png', 'https://example.com/a.png'),
    ('/media/assets/a.png', '/media/assets/a.png'),
    ('', ''),
    # Still not an image URL after the rewrite: emptied, like migration 0018
    ('http://', ''),
    ('http:///a.png', ''),
    ('http://exa mple.com/a.png', ''),
    ("http://example.com/a'b.png", ''),
    ('//example.com/a.png', ''),
    ('ftp://example.com/a.png', ''),
])
def test_upgrade_image_url(stored, expected):
    assert migration.upgrade_image_url(stored) == expected
    # Idempotent: a second run changes nothing
    assert migration.upgrade_image_url(expected) == expected


def test_upgrade_image_url_leaves_non_strings_alone():
    assert migration.upgrade_image_url(None) is None
    assert migration.upgrade_image_url(5) == 5


LEGACY_BLOCKS = {
    'navbar': {'brandName': 'B', 'logoImage': 'http://example.com/logo.png'},
    'hero': {'title': 'T', 'backgroundImage': 'http://example.com/bg.png'},
    'gallery': {'images': [{'src': 'http://example.com/1.png', 'alt': 'a'}, {'src': 'https://example.com/2.png', 'alt': 'b'}]},
    'team': {'members': [{'name': 'N', 'role': 'R', 'image': 'HTTP://example.com/p.png'}]},
}


def test_convert_block_data_covers_every_image_field():
    for block_type, data in LEGACY_BLOCKS.items():
        converted = migration.convert_block_data(block_type, data)
        assert 'http://' not in str(converted).lower().replace('https://', '')
        # What it leaves behind passes the live validator, so the page can be saved again
        assert clean_block_data(block_type, converted) == converted
        assert migration.convert_block_data(block_type, converted) is converted


def test_convert_block_data_does_not_touch_the_original_or_other_fields():
    data = copy.deepcopy(LEGACY_BLOCKS['gallery'])
    converted = migration.convert_block_data('gallery', data)
    assert data == LEGACY_BLOCKS['gallery']
    assert converted['images'][0] == {'src': 'https://example.com/1.png', 'alt': 'a'}
    assert converted['images'][1] == data['images'][1]


def test_convert_block_data_returns_the_same_object_when_nothing_changes():
    data = {'title': 'T', 'backgroundImage': 'https://example.com/bg.png'}
    assert migration.convert_block_data('hero', data) is data
    # Links are not image URLs: an http:// link stays
    cta = {'title': 'T', 'buttonLink': 'http://example.com'}
    assert migration.convert_block_data('cta', cta) is cta
    custom = {'html': '<img src="http://example.com/a.png">'}
    assert migration.convert_block_data('customHtml', custom) is custom


def test_convert_snapshot_and_metadata_report_no_change():
    snapshot = [{'id': 'a', 'type': 'hero', 'order': 0, 'data': {'backgroundImage': 'http://example.com/a.png'}, 'styles': {}}]
    converted = migration.convert_snapshot(snapshot)
    assert converted[0]['data']['backgroundImage'] == 'https://example.com/a.png'
    assert migration.convert_snapshot(converted) is None
    for odd in ([], None, {}, ['x', {'type': None}]):
        assert migration.convert_snapshot(odd) is None
    assert migration.convert_metadata({'og_image': 'http://example.com/o.png'}) == {'og_image': 'https://example.com/o.png'}
    assert migration.convert_metadata({'og_image': 'https://example.com/o.png'}) is None
    assert migration.convert_metadata({'name': 'x'}) is None
    assert migration.convert_metadata(None) is None


def _historical_apps():
    """The models as they are at migration 0019 (what RunPython receives)."""
    executor = MigrationExecutor(connection)
    return executor.loader.project_state([('pages', '0019_http_images_to_https')]).apps


def _snapshot_of(blocks):
    return [
        {'id': str(b.id), 'type': b.type, 'order': b.order, 'data': copy.deepcopy(b.data), 'styles': {}}
        for b in blocks
    ]


@pytest.mark.django_db
class TestMigrationOnRows:
    def _legacy_page(self):
        page = PageFactory(status='published', og_image='http://example.com/og.png')
        blocks = [
            BlockFactory(page=page, type=block_type, order=index, data=copy.deepcopy(data))
            for index, (block_type, data) in enumerate(LEGACY_BLOCKS.items())
        ]
        draft_version = PageVersionFactory(
            page=page, version_number=1, snapshot=_snapshot_of(blocks),
            page_metadata={'name': page.name, 'og_image': 'http://example.com/og.png'},
        )
        published_version = PageVersionFactory(page=page, version_number=2, snapshot=_snapshot_of(blocks))
        page.published_version = published_version
        page.save(update_fields=['published_version'])
        page.refresh_from_db()
        return page, blocks, draft_version, published_version

    def test_blocks_every_snapshot_and_og_image_are_converted(self):
        page, blocks, draft_version, published_version = self._legacy_page()
        updated_at = page.updated_at

        migration.convert_stored_content(_historical_apps(), None)

        for block in blocks:
            block.refresh_from_db()
            assert 'http://' not in str(block.data).lower().replace('https://', ''), block.type
        for version in (draft_version, published_version):
            version.refresh_from_db()
            assert 'http://' not in str(version.snapshot).lower().replace('https://', '')
            assert version.size_bytes > 0
        draft_version.refresh_from_db()
        assert draft_version.page_metadata['og_image'] == 'https://example.com/og.png'
        page.refresh_from_db()
        assert page.og_image == 'https://example.com/og.png'
        # No save(): the editor does not see the page as edited after publishing
        assert page.updated_at == updated_at
        assert page.published_version_id == published_version.id

    def test_running_twice_changes_nothing_more(self):
        page, blocks, *_ = self._legacy_page()
        migration.convert_stored_content(_historical_apps(), None)
        first = [(b.pk, b.data) for b in type(blocks[0]).objects.filter(page=page).order_by('order')]

        migration.convert_stored_content(_historical_apps(), None)

        second = [(b.pk, b.data) for b in type(blocks[0]).objects.filter(page=page).order_by('order')]
        assert first == second

    def test_a_converted_page_can_be_saved_again_from_the_editor(self, api_client):
        page, _blocks, *_ = self._legacy_page()
        migration.convert_stored_content(_historical_apps(), None)
        api_client.force_authenticate(user=page.owner)

        body = api_client.get(f'/api/pages/{page.id}/').json()
        body['name'] = 'Edited after the migration'
        response = api_client.put(f'/api/pages/{page.id}/', body, format='json')

        assert response.status_code == 200, response.content
        assert response.json()['blocks'][1]['data']['backgroundImage'] == 'https://example.com/bg.png'

    def test_reverse_is_a_noop(self):
        assert migration.Migration.operations[0].reverse_code is migration.migrations.RunPython.noop

    def test_depends_on_the_migration_before_it(self):
        assert ('pages', '0018_plain_text_and_safe_image_urls') in migration.Migration.dependencies

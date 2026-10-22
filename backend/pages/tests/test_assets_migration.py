"""DEPLOY-001 / CODE-001: migration 0020 moves uploaded files from disk into the database.

Files on disk are copied into AssetBlob under the same path, so the
/media/assets/<year>/<month>/<name> URLs stored in pages keep working once
the disk is gone. A missing file is skipped (its row stays, still a 404).
"""
import hashlib
import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client

from .image_files import png_bytes

migration = importlib.import_module('pages.migrations.0020_assets_in_database')

BEFORE = [('pages', '0019_http_images_to_https')]
AFTER = [('pages', '0020_assets_in_database')]


def migrate(targets):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(targets)
    return executor.loader.project_state(targets).apps


@pytest.fixture
def at_0019():
    apps = migrate(BEFORE)
    yield apps
    # Leave the database at the latest state for the next tests
    migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_files_on_disk_move_into_the_database(at_0019, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    image = png_bytes()
    (tmp_path / 'assets' / '2026' / '10').mkdir(parents=True)
    (tmp_path / 'assets' / '2026' / '10' / 'kept.png').write_bytes(image)

    Asset = at_0019.get_model('pages', 'Asset')
    owner = None  # nullable; the account side is not what this migration changes
    kept = Asset.objects.create(owner=owner, name='kept.png', file='assets/2026/10/kept.png', mime_type='image/png', size=1)
    lost = Asset.objects.create(owner=owner, name='lost.png', file='assets/2026/10/lost.png', mime_type='image/png', size=7)
    outside = Asset.objects.create(owner=owner, name='x', file='../../etc/passwd', mime_type='image/png', size=3)

    apps = migrate(AFTER)

    Asset = apps.get_model('pages', 'Asset')
    AssetBlob = apps.get_model('pages', 'AssetBlob')
    moved = Asset.objects.get(pk=kept.pk)
    assert moved.path == 'assets/2026/10/kept.png'
    assert moved.size == len(image)
    assert moved.sha256 == hashlib.sha256(image).hexdigest()
    assert (moved.width, moved.height) == (40, 40)
    assert bytes(AssetBlob.objects.get(asset_id=kept.pk).data) == image

    missing = Asset.objects.get(pk=lost.pk)
    assert missing.path == 'assets/2026/10/lost.png'
    assert not AssetBlob.objects.filter(asset_id=lost.pk).exists()
    # A name that points outside the media folder is never read
    assert not AssetBlob.objects.filter(asset_id=outside.pk).exists()

    # The URL that pages stored is served from the database
    response = Client().get('/media/assets/2026/10/kept.png')
    assert response.status_code == 200
    assert response.content == image
    assert Client().get('/media/assets/2026/10/lost.png').status_code == 404


@pytest.mark.django_db(transaction=True)
def test_reverse_writes_the_files_back(at_0019, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    image = png_bytes()
    (tmp_path / 'assets').mkdir()
    (tmp_path / 'assets' / 'a.png').write_bytes(image)
    Asset = at_0019.get_model('pages', 'Asset')
    asset = Asset.objects.create(name='a.png', file='assets/a.png', mime_type='image/png', size=1)

    migrate(AFTER)
    (tmp_path / 'assets' / 'a.png').unlink()
    apps = migrate(BEFORE)

    assert apps.get_model('pages', 'Asset').objects.get(pk=asset.pk).file.name == 'assets/a.png'
    assert (tmp_path / 'assets' / 'a.png').read_bytes() == image


def test_depends_on_the_migration_before_it():
    assert ('pages', '0019_http_images_to_https') in migration.Migration.dependencies

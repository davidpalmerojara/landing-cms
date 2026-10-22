"""Uploaded images move from the server's disk into the database (ADR-049).

Each Asset gets the path it is served at (its old file name, so the
`/media/assets/...` URLs stored in pages keep working) and its bytes in
AssetBlob. A file missing from disk is logged and skipped: its row stays,
and its URL answers 404 as it already did. Production starts empty; this is
for development databases. The file field is removed afterwards.
"""
import hashlib
import io
import logging
from pathlib import Path

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

logger = logging.getLogger(__name__)


def media_root() -> Path:
    # MEDIA_ROOT is no longer a setting; the files were in backend/media
    return Path(getattr(settings, 'MEDIA_ROOT', '') or settings.BASE_DIR / 'media').resolve()


def image_size(data: bytes) -> tuple[int | None, int | None]:
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(data)) as image:
            return image.size
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None, None


def read_inside(root: Path, name: str) -> bytes | None:
    """The file `name` under `root`, or None (missing, unreadable, or a name pointing outside root)."""
    path = (root / name).resolve()
    if root not in path.parents:
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def copy_files_into_database(apps, schema_editor):
    Asset = apps.get_model('pages', 'Asset')
    AssetBlob = apps.get_model('pages', 'AssetBlob')
    root = media_root()
    copied = missing = 0
    for pk, name in list(Asset.objects.order_by('pk').values_list('pk', 'file')):
        name = name or ''
        path = name or f'assets/missing-{pk.hex}'
        data = read_inside(root, name) if name else None
        if data is None:
            missing += 1
            logger.warning('Asset %s: file %r not found under %s; its URL stays a 404', pk, name, root)
            Asset.objects.filter(pk=pk).update(path=path)
            continue
        width, height = image_size(data)
        Asset.objects.filter(pk=pk).update(
            path=path, size=len(data), sha256=hashlib.sha256(data).hexdigest(), width=width, height=height,
        )
        AssetBlob.objects.create(asset_id=pk, data=data)
        copied += 1
    if copied or missing:
        logger.info('Assets moved into the database: %s copied, %s files missing', copied, missing)


def copy_database_into_files(apps, schema_editor):
    Asset = apps.get_model('pages', 'Asset')
    AssetBlob = apps.get_model('pages', 'AssetBlob')
    root = media_root()
    for pk, path in list(Asset.objects.order_by('pk').values_list('pk', 'path')):
        blob = AssetBlob.objects.filter(asset_id=pk).values_list('data', flat=True).first()
        target = (root / path).resolve()
        if blob is not None and root in target.parents:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bytes(blob))
        Asset.objects.filter(pk=pk).update(file=path)


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0019_http_images_to_https'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='path',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='sha256',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='asset',
            name='width',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='asset',
            name='height',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='AssetBlob',
            fields=[
                ('asset', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='blob',
                    serialize=False, to='pages.asset',
                )),
                ('data', models.BinaryField()),
            ],
        ),
        # Nullable first, so that going back can add the column again before filling it
        migrations.AlterField(
            model_name='asset',
            name='file',
            field=models.FileField(null=True, upload_to='assets/%Y/%m/'),
        ),
        migrations.RunPython(copy_files_into_database, copy_database_into_files),
        migrations.RemoveField(
            model_name='asset',
            name='file',
        ),
        migrations.AlterField(
            model_name='asset',
            name='path',
            field=models.CharField(max_length=255, unique=True),
        ),
    ]

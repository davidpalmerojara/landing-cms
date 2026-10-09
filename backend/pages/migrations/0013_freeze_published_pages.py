"""Give every already-published page its frozen public copy (ADR-017).

Until now the public page showed the live draft. Snapshot each published
page's current content so visitors keep seeing exactly the same thing.
"""
import json

from django.db import migrations
from django.db.models import Max

METADATA_FIELDS = (
    'name', 'slug', 'status', 'theme_id', 'custom_theme', 'design_tokens',
    'seo_title', 'seo_description', 'seo_canonical_url',
    'og_title', 'og_description', 'og_image', 'og_type', 'noindex',
)


def freeze_published_pages(apps, schema_editor):
    Page = apps.get_model('pages', 'Page')
    PageVersion = apps.get_model('pages', 'PageVersion')

    for page in Page.objects.filter(status='published', published_version__isnull=True):
        snapshot = [
            {'id': str(b.id), 'type': b.type, 'order': b.order, 'data': b.data, 'styles': b.styles}
            for b in page.blocks.order_by('order')
        ]
        last = PageVersion.objects.filter(page=page).aggregate(n=Max('version_number'))['n'] or 0
        version = PageVersion.objects.create(
            page=page,
            version_number=last + 1,
            snapshot=snapshot,
            page_metadata={field: getattr(page, field) for field in METADATA_FIELDS},
            trigger='auto_publish',
            label='Publicación',
            created_by=page.owner,
            size_bytes=len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8')),
        )
        Page.objects.filter(pk=page.pk).update(published_version=version, published_at=page.updated_at)


class Migration(migrations.Migration):
    dependencies = [
        ('pages', '0012_page_published_version'),
    ]

    operations = [
        migrations.RunPython(freeze_published_pages, migrations.RunPython.noop),
    ]

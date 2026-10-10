"""Stored http:// image URLs become https:// (SEC3-001, follows ADR-047).

Since the image rule only admits `https://host/...` or a `/path`, a page that
still held an `http://` image (saved before the rule) could not be saved from
the editor any more: every PUT sent the old value back and the server refused
it. Browsers already blocked those images under the CSP, so nothing visible is
lost by rewriting the scheme. Applies to every Block, every PageVersion
snapshot (published copies included), the snapshot metadata and `og_image`.

Whatever is still not a valid image URL after the rewrite (an `http://` with no
host, say) is emptied, like migration 0018 did.

Self-contained on purpose (frozen copies of the rules, like 0018) and
idempotent: a second run changes nothing.
"""
import copy
import json
import re

from django.db import migrations

# block type -> (top-level image URL fields, {list key: item image URL fields})
IMAGE_URL_FIELDS = {
    'navbar': (['logoImage'], {}),
    'hero': (['backgroundImage'], {}),
    'gallery': ([], {'images': ['src']}),
    'team': ([], {'members': ['image']}),
}

_IMAGE_URL_FORBIDDEN = re.compile(r'[\s\x00-\x20\x7f-\x9f\\\'"()<>;{}`]')
_IMAGE_URL_ABSOLUTE = re.compile(r'https://[^/?#].*', re.IGNORECASE)
_HTTP_SCHEME = re.compile(r'http://', re.IGNORECASE)


def is_safe_image_url(value):
    """The rule of `validate_safe_image_url` at the time of this migration."""
    if value == '':
        return True
    if _IMAGE_URL_FORBIDDEN.search(value):
        return False
    if value.startswith('/') and not value.startswith('//'):
        return True
    return bool(_IMAGE_URL_ABSOLUTE.fullmatch(value))


def upgrade_image_url(value):
    """`http://host/x` -> `https://host/x`; anything else that the rule would
    refuse -> ''. Values that already pass are returned untouched."""
    if not isinstance(value, str):
        return value
    if _HTTP_SCHEME.match(value):
        value = 'https://' + value[len('http://'):]
    return value if is_safe_image_url(value) else ''


def _convert_fields(data, top_fields, list_fields, convert):
    """A copy of `data` with `convert` applied to the given fields; the same
    object when nothing changed."""
    if not isinstance(data, dict):
        return data
    result = data
    for key in top_fields:
        value = data.get(key)
        new_value = convert(value)
        if new_value != value:
            if result is data:
                result = copy.deepcopy(data)
            result[key] = new_value
    for list_key, item_fields in list_fields.items():
        items = data.get(list_key)
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            for key in item_fields:
                value = item.get(key)
                new_value = convert(value)
                if new_value != value:
                    if result is data:
                        result = copy.deepcopy(data)
                    result[list_key][index][key] = new_value
    return result


def convert_block_data(block_type, data):
    """The block's data with its image URLs upgraded; the very same object
    when there is nothing to change."""
    if block_type not in IMAGE_URL_FIELDS:
        return data
    top, lists = IMAGE_URL_FIELDS[block_type]
    return _convert_fields(data, top, lists, upgrade_image_url)


def convert_snapshot(snapshot):
    """The snapshot with every block converted, or None when nothing changed."""
    if not isinstance(snapshot, list):
        return None
    changed = False
    converted = []
    for block in snapshot:
        if isinstance(block, dict) and isinstance(block.get('type'), str):
            new_data = convert_block_data(block['type'], block.get('data'))
            if new_data is not block.get('data'):
                block = {**block, 'data': new_data}
                changed = True
        converted.append(block)
    return converted if changed else None


def convert_metadata(metadata):
    """Snapshot page metadata with an upgraded og_image, or None when nothing changed."""
    if not isinstance(metadata, dict) or 'og_image' not in metadata:
        return None
    og_image = upgrade_image_url(metadata['og_image'])
    if og_image == metadata['og_image']:
        return None
    return {**metadata, 'og_image': og_image}


def convert_stored_content(apps, schema_editor):
    Block = apps.get_model('pages', 'Block')
    Page = apps.get_model('pages', 'Page')
    PageVersion = apps.get_model('pages', 'PageVersion')

    # queryset.update(): no save(), so updated_at (and with it the page's
    # "unpublished changes" flag) stays as it was.
    for block in Block.objects.filter(type__in=list(IMAGE_URL_FIELDS)).iterator():
        new_data = convert_block_data(block.type, block.data)
        if new_data is not block.data:
            Block.objects.filter(pk=block.pk).update(data=new_data)

    for version in PageVersion.objects.all().iterator():
        changes = {}
        snapshot = convert_snapshot(version.snapshot)
        if snapshot is not None:
            changes['snapshot'] = snapshot
            changes['size_bytes'] = len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8'))
        metadata = convert_metadata(version.page_metadata)
        if metadata is not None:
            changes['page_metadata'] = metadata
        if changes:
            PageVersion.objects.filter(pk=version.pk).update(**changes)

    for page in Page.objects.exclude(og_image='').only('pk', 'og_image').iterator():
        og_image = upgrade_image_url(page.og_image)
        if og_image != page.og_image:
            Page.objects.filter(pk=page.pk).update(og_image=og_image)


class Migration(migrations.Migration):
    dependencies = [
        ('pages', '0018_plain_text_and_safe_image_urls'),
    ]

    operations = [
        migrations.RunPython(convert_stored_content, migrations.RunPython.noop),
    ]

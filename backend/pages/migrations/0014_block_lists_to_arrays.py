"""Turn the numbered list keys of block data into arrays of objects.

Before: feature1Title, feature1Desc, feature2Title, ... (one key per item field).
After:  features: [{title, description}, ...].

Applies to every Block row and to every PageVersion snapshot (the public page
serves the published snapshot as it is). The shapes and the rules are the ones
of the S8 contract: the page must look the same after the conversion, so items
the block hides today (empty FAQ questions, logo names, menu labels) are
dropped and the items it shows, even empty, are kept.

The conversion is a pure function in this module on purpose: a migration must
not import code that may change later.
"""
import json
import re

from django.db import migrations

MAX_SCAN = 12  # items are looked up as N = 1..12

# block type -> (new list key, [(item field, old key template, kind)])
# The first old key of the list is also the one that tells an empty item.
LIST_SPECS = {
    'features': ('features', [
        ('title', 'feature{n}Title', 'string'),
        ('description', 'feature{n}Desc', 'string'),
    ]),
    'testimonials': ('testimonials', [
        ('quote', 'quote{n}', 'string'),
        ('author', 'author{n}', 'string'),
        ('role', 'role{n}', 'string'),
    ]),
    'pricing': ('plans', [
        ('name', 'plan{n}Name', 'string'),
        ('price', 'plan{n}Price', 'string'),
        ('features', 'plan{n}Features', 'string'),
        ('buttonText', 'plan{n}ButtonText', 'string'),
        ('buttonLink', 'plan{n}ButtonLink', 'string'),
        ('highlighted', 'plan{n}Highlighted', 'boolean'),
    ]),
    'faq': ('questions', [
        ('question', 'q{n}', 'string'),
        ('answer', 'a{n}', 'string'),
    ]),
    'logoCloud': ('logos', [
        ('name', 'logo{n}', 'string'),
    ]),
    'gallery': ('images', [
        ('src', 'image{n}', 'string'),
    ]),
    'team': ('members', [
        ('name', 'member{n}Name', 'string'),
        ('role', 'member{n}Role', 'string'),
        ('image', 'member{n}Image', 'string'),
    ]),
    'stats': ('stats', [
        ('value', 'stat{n}Value', 'string'),
        ('label', 'stat{n}Label', 'string'),
    ]),
    'timeline': ('events', [
        ('date', 'item{n}Date', 'string'),
        ('title', 'item{n}Title', 'string'),
        ('description', 'item{n}Desc', 'string'),
    ]),
    'navbar': ('links', [
        ('label', 'link{n}', 'string'),
        ('url', 'link{n}Url', 'string'),
    ]),
    'footer': ('links', [
        ('label', 'link{n}Label', 'string'),
        ('url', 'link{n}Url', 'string'),
    ]),
}

# Item field that must be non-empty for the block to show the item today
DROP_WHEN_EMPTY = {
    'faq': 'question',
    'logoCloud': 'name',
    'navbar': 'label',
    'footer': 'label',
}


def _old_key_pattern(template):
    return re.compile('^' + re.escape(template).replace(re.escape('{n}'), r'\d+') + '$')


def _as_string(value):
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, (bool, int, float)):
        return str(value)
    return ''


def _gallery_slots(data):
    columns = data.get('columns')
    try:
        columns = int(columns)
    except (TypeError, ValueError):
        columns = 3
    if columns not in (2, 3, 4):
        columns = 3
    return columns * 2


def convert_block_data(block_type, data):
    """Return `data` with the numbered list keys of `block_type` turned into
    the array. Pure and idempotent: data without a list for this block type
    comes back as it is, data already holding the array is left untouched, and
    the input is never modified."""
    spec = LIST_SPECS.get(block_type)
    if spec is None or not isinstance(data, dict):
        return data
    list_key, fields = spec
    if list_key in data:
        return data

    last_found = 0
    for n in range(1, MAX_SCAN + 1):
        if any(template.format(n=n) in data for _, template, _ in fields):
            last_found = n

    # Items 1..last_found: a gap (item 2 present, item 1 absent) becomes an
    # empty item so that every item keeps its position, which the blocks and
    # `plan2Highlighted -> plans[1]` rely on.
    items = []
    for n in range(1, last_found + 1):
        item = {}
        for name, template, kind in fields:
            value = data.get(template.format(n=n))
            item[name] = (value is True) if kind == 'boolean' else _as_string(value)
        items.append(item)

    if block_type == 'gallery':
        slots = _gallery_slots(data)
        items = items[:slots]
        while len(items) < slots:
            items.append({'src': ''})
        items = [{'src': item['src'], 'alt': ''} for item in items]
    elif block_type in DROP_WHEN_EMPTY:
        required = DROP_WHEN_EMPTY[block_type]
        items = [item for item in items if item[required]]

    old_patterns = [_old_key_pattern(template) for _, template, _ in fields]
    converted = {
        key: value
        for key, value in data.items()
        if not any(pattern.match(key) for pattern in old_patterns)
    }
    converted[list_key] = items
    return converted


def _convert_snapshot(snapshot):
    """Convert the data of every block of a version snapshot. Returns the new
    snapshot, or None when nothing changed."""
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


def blocks_to_arrays(apps, schema_editor):
    Block = apps.get_model('pages', 'Block')
    PageVersion = apps.get_model('pages', 'PageVersion')

    # queryset.update(): no save(), so updated_at (and with it the page's
    # "unpublished changes" flag) stays as it was. Same visible content.
    for block in Block.objects.filter(type__in=list(LIST_SPECS)).iterator():
        new_data = convert_block_data(block.type, block.data)
        if new_data is not block.data:
            Block.objects.filter(pk=block.pk).update(data=new_data)

    for version in PageVersion.objects.all().iterator():
        snapshot = _convert_snapshot(version.snapshot)
        if snapshot is not None:
            PageVersion.objects.filter(pk=version.pk).update(
                snapshot=snapshot,
                size_bytes=len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8')),
            )


class Migration(migrations.Migration):
    dependencies = [
        ('pages', '0013_freeze_published_pages'),
    ]

    operations = [
        migrations.RunPython(blocks_to_arrays, migrations.RunPython.noop),
    ]

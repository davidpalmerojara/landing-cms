"""Stored content catches up with the new field rules (ADR-029 follow-up, ADR-031).

1. Plain text. The long text fields of the blocks (subtitles, descriptions,
   quotes, answers, plan features) used to be saved as sanitized HTML: bleach
   kept a few tags and wrote `&` as `&amp;`, `<` as `&lt;`. Blocks render
   those fields as text, so visitors saw `Q&amp;A`. The fields are plain text
   now; this strips the tags and decodes the entities once, in every Block and
   in every PageVersion snapshot (published copies included: the public page
   serves them as they are).
2. Image URLs. The URLs that end up in CSS (`background-image: url(...)`) can
   no longer hold quotes, parentheses, `;`... A value stored before that
   would make every later save of its page fail validation, so the ones that
   do not pass are emptied (blocks, snapshots and og_image).
3. `og_type` is limited to website/article: any other value becomes `website`
   (page and snapshot metadata).
4. Snapshot metadata gets `language` ('es', what every page had until now).

Self-contained on purpose (frozen copies of the rules): later changes to app
code must not alter what this migration does. The conversions are pure
functions, idempotent where it matters (the URL and og_type ones), and the
text one runs once, here.
"""
import copy
import html
import json
import re

from django.db import migrations

# block type -> (top-level text fields, {list key: item text fields})
PLAIN_TEXT_FIELDS = {
    'hero': (['subtitle'], {}),
    'features': ([], {'features': ['description']}),
    'testimonials': ([], {'testimonials': ['quote']}),
    'cta': (['subtitle'], {}),
    'footer': (['description'], {}),
    'pricing': (['subtitle'], {'plans': ['features']}),
    'faq': ([], {'questions': ['answer']}),
    'gallery': (['subtitle'], {}),
    'contact': (['subtitle'], {}),
    'team': (['subtitle'], {}),
    'stats': (['subtitle'], {}),
    'timeline': ([], {'events': ['description']}),
}

# block type -> (top-level image URL fields, {list key: item image URL fields})
IMAGE_URL_FIELDS = {
    'navbar': (['logoImage'], {}),
    'hero': (['backgroundImage'], {}),
    'gallery': ([], {'images': ['src']}),
    'team': ([], {'members': ['image']}),
}

OG_TYPES = ('website', 'article')
DEFAULT_LANGUAGE = 'es'

_BREAK = re.compile(r'<br\s*/?>', re.IGNORECASE)
_TAG = re.compile(r'<[^>]*>')
_IMAGE_URL_FORBIDDEN = re.compile(r'[\s\x00-\x20\x7f-\x9f\\\'"()<>;{}`]')
_IMAGE_URL_ABSOLUTE = re.compile(r'https?://[^/?#].*', re.IGNORECASE)


def to_plain_text(value):
    """Stored sanitized HTML -> the text it showed. Tags are bleach's own
    output, where a literal `<` is always `&lt;`, so what looks like a tag is one."""
    if not isinstance(value, str):
        return value
    return html.unescape(_TAG.sub('', _BREAK.sub('\n', value)))


def is_safe_image_url(value):
    if value == '':
        return True
    if _IMAGE_URL_FORBIDDEN.search(value):
        return False
    if value.startswith('/') and not value.startswith('//'):
        return True
    return bool(_IMAGE_URL_ABSOLUTE.fullmatch(value))


def clean_image_url(value):
    if not isinstance(value, str) or is_safe_image_url(value):
        return value
    return ''


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
    """The block's data with its text fields as plain text and its image URLs
    safe. Returns the very same object when there is nothing to change."""
    result = data
    if block_type in PLAIN_TEXT_FIELDS:
        top, lists = PLAIN_TEXT_FIELDS[block_type]
        result = _convert_fields(result, top, lists, to_plain_text)
    if block_type in IMAGE_URL_FIELDS:
        top, lists = IMAGE_URL_FIELDS[block_type]
        result = _convert_fields(result, top, lists, clean_image_url)
    return result


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
    """Snapshot page metadata with a valid og_type and og_image and a language,
    or None when nothing changed."""
    if not isinstance(metadata, dict):
        return None
    result = dict(metadata)
    if 'og_type' in result and result['og_type'] not in OG_TYPES:
        result['og_type'] = 'website'
    if 'og_image' in result:
        result['og_image'] = clean_image_url(result['og_image'])
    result.setdefault('language', DEFAULT_LANGUAGE)
    return result if result != metadata else None


def convert_stored_content(apps, schema_editor):
    Block = apps.get_model('pages', 'Block')
    Page = apps.get_model('pages', 'Page')
    PageVersion = apps.get_model('pages', 'PageVersion')

    # queryset.update(): no save(), so updated_at (and with it the page's
    # "unpublished changes" flag) stays as it was. Same content, as text.
    for block in Block.objects.filter(type__in=list(PLAIN_TEXT_FIELDS) + list(IMAGE_URL_FIELDS)).iterator():
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

    Page.objects.exclude(og_type__in=OG_TYPES).update(og_type='website')
    for page in Page.objects.exclude(og_image='').only('pk', 'og_image').iterator():
        if not is_safe_image_url(page.og_image):
            Page.objects.filter(pk=page.pk).update(og_image='')


class Migration(migrations.Migration):
    dependencies = [
        ('pages', '0017_page_language_and_og_type_choices'),
    ]

    operations = [
        migrations.RunPython(convert_stored_content, migrations.RunPython.noop),
    ]

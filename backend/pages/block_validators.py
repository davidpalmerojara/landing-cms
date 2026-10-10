from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Callable

from rest_framework import serializers

from .block_sanitizers import (
    sanitize_custom_html,
    sanitize_plain_text,
    validate_safe_link,
    validate_safe_image_url,
)


PLAIN_TEXT_MAX = 200
RICH_TEXT_MAX = 500
BUTTON_TEXT_MAX = 50
PLACEHOLDER_MAX = 100
NAME_MAX = 100
QUOTE_MAX = 500
FAQ_QUESTION_MAX = 200
FAQ_ANSWER_MAX = 1000
ALT_TEXT_MAX = 300
COPYRIGHT_MAX = 200
CUSTOM_HTML_MAX = 50_000
# Whole data object of one block, serialized (custom HTML is the largest field)
MAX_BLOCK_DATA_BYTES = 64_000

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class FieldRule:
    kind: str = 'string'
    max_length: int | None = None
    required: bool = False
    allow_null: bool = True
    choices: tuple[str, ...] | None = None
    sanitizer: Callable | None = sanitize_plain_text
    safe_url: bool = False
    safe_link: bool = False
    coerce_to_string: bool = False
    # kind='list': a list of objects. item_rules is the allowlist of fields of
    # each item (same rule kinds as the block's own fields), max_items the cap.
    item_rules: dict[str, 'FieldRule'] | None = None
    max_items: int | None = None


def _validate_fields(
    block_type: str,
    data: dict,
    rules: dict[str, FieldRule],
    *,
    partial: bool,
) -> dict:
    if not isinstance(data, dict):
        raise serializers.ValidationError('El campo data debe ser un objeto JSON.')

    # Allowlist: only fields with a rule are kept, so unknown keys (such as an
    # unvalidated "buttonLink": "javascript:...") never reach the database or
    # other editors. Dropped rather than rejected so pages saved with stale
    # keys can still be saved.
    unknown = sorted(set(data) - set(rules))
    if unknown:
        logger.info('Dropping unknown %s fields: %s', block_type, unknown)
    validated: dict = {}
    errors: dict[str, list[str]] = {}

    for key, rule in rules.items():
        if key not in data:
            if rule.required and not partial:
                errors.setdefault(key, []).append('Este campo es obligatorio.')
            continue

        value = data[key]
        if value is None:
            if not rule.allow_null or rule.kind == 'list':
                errors.setdefault(key, []).append('Este campo no puede ser null.')
            else:
                validated[key] = None
            continue

        if rule.kind == 'list':
            items = _validate_list(block_type, key, rule, value, errors)
            if items is not None:
                validated[key] = items
            continue

        if rule.kind == 'boolean':
            if not isinstance(value, bool):
                errors.setdefault(key, []).append('Debe ser un booleano.')
            else:
                validated[key] = value
            continue

        if rule.coerce_to_string and isinstance(value, int):
            value = str(value)

        if rule.kind == 'string':
            if not isinstance(value, str):
                errors.setdefault(key, []).append('Debe ser un texto.')
                continue
            if rule.max_length is not None and len(value) > rule.max_length:
                errors.setdefault(key, []).append(f'Máximo {rule.max_length} caracteres.')
                continue
            if rule.safe_url or rule.safe_link:
                validate_url = validate_safe_link if rule.safe_link else validate_safe_image_url
                try:
                    value = validate_url(value)
                except serializers.ValidationError as exc:
                    detail = exc.detail
                    if isinstance(detail, list):
                        errors.setdefault(key, []).extend(str(item) for item in detail)
                    else:
                        errors.setdefault(key, []).append(str(detail))
                    continue
            if rule.choices is not None and value not in rule.choices:
                allowed = ', '.join(rule.choices)
                errors.setdefault(key, []).append(f'Valor inválido. Usa uno de: {allowed}.')
                continue
            if rule.sanitizer is not None:
                value = rule.sanitizer(value)
            validated[key] = value
            continue

        errors.setdefault(key, []).append(f'Tipo de regla no soportado para {block_type}.{key}.')

    if errors:
        raise serializers.ValidationError(errors)

    return validated


def _item_default(rule: FieldRule):
    return False if rule.kind == 'boolean' else ''


def _validate_list(
    block_type: str,
    key: str,
    rule: FieldRule,
    value,
    errors: dict[str, list[str]],
) -> list[dict] | None:
    """Validate a list of objects. Every item is checked against rule.item_rules
    (unknown item keys dropped, wrong types rejected) and comes out with all its
    keys: a missing or null field gets its default ('' or False). Errors go to
    `errors` under "key[index].field". Returns None when there are errors."""
    if not isinstance(value, list):
        errors.setdefault(key, []).append('Debe ser una lista.')
        return None
    if rule.max_items is not None and len(value) > rule.max_items:
        errors.setdefault(key, []).append(f'Máximo {rule.max_items} elementos.')
        return None

    items: list[dict] = []
    failed = False
    for index, item in enumerate(value):
        path = f'{key}[{index}]'
        if not isinstance(item, dict):
            errors.setdefault(path, []).append('Cada elemento debe ser un objeto.')
            failed = True
            continue
        present = {name: field for name, field in item.items() if field is not None}
        try:
            clean = _validate_fields(f'{block_type}.{path}', present, rule.item_rules or {}, partial=False)
        except serializers.ValidationError as exc:
            for name, messages in exc.detail.items():
                errors.setdefault(f'{path}.{name}', []).extend(str(message) for message in messages)
            failed = True
            continue
        items.append({
            name: clean[name] if name in clean else _item_default(item_rule)
            for name, item_rule in (rule.item_rules or {}).items()
        })
    return None if failed else items


URL_RULE = FieldRule(max_length=2000, safe_url=True, sanitizer=None)
# Followable links (buttons, nav items): see validate_safe_link
LINK_RULE = FieldRule(max_length=2000, safe_link=True, sanitizer=None)
PLAIN_RULE = FieldRule(max_length=PLAIN_TEXT_MAX)
# Longer plain text (descriptions, answers, quotes). No field takes formatting:
# the editor has none and React renders every field as text (ADR-031).
RICH_RULE = FieldRule(max_length=RICH_TEXT_MAX)
BUTTON_RULE = FieldRule(max_length=BUTTON_TEXT_MAX)
PLACEHOLDER_RULE = FieldRule(max_length=PLACEHOLDER_MAX)
NAME_RULE = FieldRule(max_length=NAME_MAX)
# Navbar and footer share the same menu item shape
LINKS_RULE = FieldRule(kind='list', max_items=6, item_rules={
    'label': PLAIN_RULE,
    'url': LINK_RULE,
})


def validate_navbar_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('navbar', data, {
        'brandName': NAME_RULE,
        'logoImage': URL_RULE,
        'links': LINKS_RULE,
        'ctaText': BUTTON_RULE,
        'ctaLink': LINK_RULE,
    }, partial=partial)


def validate_hero_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('hero', data, {
        'title': FieldRule(max_length=PLAIN_TEXT_MAX, allow_null=False),
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'buttonText': BUTTON_RULE,
        'buttonLink': LINK_RULE,
        'badgeText': BUTTON_RULE,
        'secondaryButtonText': BUTTON_RULE,
        'secondaryButtonLink': LINK_RULE,
        'backgroundImage': URL_RULE,
        'alignment': FieldRule(
            max_length=10,
            choices=('left', 'center', 'right'),
            sanitizer=sanitize_plain_text,
        ),
    }, partial=partial)


def validate_features_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('features', data, {
        'title': FieldRule(max_length=PLAIN_TEXT_MAX, allow_null=True),
        'features': FieldRule(kind='list', max_items=6, item_rules={
            'title': PLAIN_RULE,
            'description': RICH_RULE,
        }),
    }, partial=partial)


def validate_testimonials_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('testimonials', data, {
        'title': PLAIN_RULE,
        'testimonials': FieldRule(kind='list', max_items=6, item_rules={
            'quote': FieldRule(max_length=QUOTE_MAX),
            'author': NAME_RULE,
            'role': PLAIN_RULE,
        }),
    }, partial=partial)


def validate_cta_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('cta', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'buttonText': BUTTON_RULE,
        'buttonLink': LINK_RULE,
    }, partial=partial)


def validate_footer_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('footer', data, {
        'brandName': NAME_RULE,
        'description': FieldRule(max_length=RICH_TEXT_MAX),
        'copyright': FieldRule(max_length=COPYRIGHT_MAX),
        'links': LINKS_RULE,
    }, partial=partial)


def validate_pricing_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('pricing', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'plans': FieldRule(kind='list', max_items=4, item_rules={
            'name': NAME_RULE,
            'price': PLAIN_RULE,
            'features': FieldRule(max_length=FAQ_ANSWER_MAX),
            'buttonText': BUTTON_RULE,
            'buttonLink': LINK_RULE,
            'highlighted': FieldRule(kind='boolean'),
        }),
        'billingPeriod': PLAIN_RULE,
        'popularBadgeText': BUTTON_RULE,
    }, partial=partial)


def validate_faq_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('faq', data, {
        'title': PLAIN_RULE,
        'questions': FieldRule(kind='list', max_items=12, item_rules={
            'question': FieldRule(max_length=FAQ_QUESTION_MAX),
            'answer': FieldRule(max_length=FAQ_ANSWER_MAX),
        }),
    }, partial=partial)


def validate_logo_cloud_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('logoCloud', data, {
        'title': PLAIN_RULE,
        'logos': FieldRule(kind='list', max_items=12, item_rules={'name': NAME_RULE}),
    }, partial=partial)


def validate_gallery_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('gallery', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'columns': FieldRule(
            max_length=1,
            choices=('2', '3', '4'),
            sanitizer=sanitize_plain_text,
            coerce_to_string=True,
        ),
        'images': FieldRule(kind='list', max_items=12, item_rules={
            'src': URL_RULE,
            'alt': FieldRule(max_length=ALT_TEXT_MAX),
        }),
    }, partial=partial)


def validate_contact_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('contact', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'buttonText': BUTTON_RULE,
        'namePlaceholder': PLACEHOLDER_RULE,
        'emailPlaceholder': PLACEHOLDER_RULE,
        'messagePlaceholder': PLACEHOLDER_RULE,
    }, partial=partial)


def validate_custom_html_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('customHtml', data, {
        'html': FieldRule(max_length=CUSTOM_HTML_MAX, sanitizer=sanitize_custom_html),
    }, partial=partial)


def validate_team_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('team', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'members': FieldRule(kind='list', max_items=8, item_rules={
            'name': NAME_RULE,
            'role': PLAIN_RULE,
            'image': URL_RULE,
        }),
    }, partial=partial)


def validate_stats_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('stats', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX),
        'stats': FieldRule(kind='list', max_items=6, item_rules={
            'value': PLAIN_RULE,
            'label': PLAIN_RULE,
        }),
    }, partial=partial)


def validate_timeline_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('timeline', data, {
        'title': PLAIN_RULE,
        'events': FieldRule(kind='list', max_items=10, item_rules={
            'date': PLAIN_RULE,
            'title': PLAIN_RULE,
            'description': RICH_RULE,
        }),
    }, partial=partial)


BLOCK_VALIDATORS: dict[str, Callable[[dict], dict]] = {
    'navbar': validate_navbar_data,
    'hero': validate_hero_data,
    'features': validate_features_data,
    'testimonials': validate_testimonials_data,
    'cta': validate_cta_data,
    'footer': validate_footer_data,
    'pricing': validate_pricing_data,
    'faq': validate_faq_data,
    'logoCloud': validate_logo_cloud_data,
    'gallery': validate_gallery_data,
    'contact': validate_contact_data,
    'customHtml': validate_custom_html_data,
    'team': validate_team_data,
    'stats': validate_stats_data,
    'timeline': validate_timeline_data,
}


def clean_block_data(block_type: str, data, *, partial: bool = False) -> dict:
    """Single validation path for block content, used by the REST API and the
    collaboration WebSocket: known type, size limit, allowlist, and one pass of
    validation and sanitizing per field (the field's own rule sanitizes it)."""
    if block_type not in BLOCK_VALIDATORS:
        raise serializers.ValidationError(f'Tipo de bloque desconocido: {block_type}.')
    if not isinstance(data, dict):
        raise serializers.ValidationError('El campo data debe ser un objeto JSON.')
    if len(json.dumps(data, ensure_ascii=False).encode()) > MAX_BLOCK_DATA_BYTES:
        raise serializers.ValidationError('El contenido del bloque es demasiado grande.')
    return validate_block_data(block_type, data, partial=partial)


def validate_block_data(block_type: str | None, data: dict, *, partial: bool = False) -> dict:
    if not block_type:
        return data
    validator = BLOCK_VALIDATORS.get(block_type)
    if validator is None:
        return data
    return validator(data, partial=partial)

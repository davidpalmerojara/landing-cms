from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from rest_framework import serializers

from .block_sanitizers import (
    sanitize_custom_html,
    sanitize_plain_text,
    sanitize_text,
    validate_safe_url,
)


PLAIN_TEXT_MAX = 200
RICH_TEXT_MAX = 500
BUTTON_TEXT_MAX = 50
PLACEHOLDER_MAX = 100
NAME_MAX = 100
QUOTE_MAX = 500
FAQ_QUESTION_MAX = 200
FAQ_ANSWER_MAX = 1000
COPYRIGHT_MAX = 200
CUSTOM_HTML_MAX = 50_000

@dataclass(frozen=True)
class FieldRule:
    kind: str = 'string'
    max_length: int | None = None
    required: bool = False
    allow_null: bool = True
    choices: tuple[str, ...] | None = None
    sanitizer: Callable | None = sanitize_plain_text
    safe_url: bool = False
    coerce_to_string: bool = False


def _validate_fields(
    block_type: str,
    data: dict,
    rules: dict[str, FieldRule],
    *,
    partial: bool,
) -> dict:
    if not isinstance(data, dict):
        raise serializers.ValidationError('El campo data debe ser un objeto JSON.')

    validated = dict(data)
    errors: dict[str, list[str]] = {}

    for key, rule in rules.items():
        if key not in data:
            if rule.required and not partial:
                errors.setdefault(key, []).append('Este campo es obligatorio.')
            continue

        value = data[key]
        if value is None:
            if not rule.allow_null:
                errors.setdefault(key, []).append('Este campo no puede ser null.')
            continue

        if rule.kind == 'boolean':
            if not isinstance(value, bool):
                errors.setdefault(key, []).append('Debe ser un booleano.')
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
            if rule.safe_url:
                try:
                    value = validate_safe_url(value)
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


# TODO: Divergence with ai_generation.block_schemas: the runtime editor includes
# extra fields like hero.badgeText, hero.secondaryButtonText, pricing.billingPeriod,
# pricing.popularBadgeText, contact placeholders, and the customHtml block itself.
# Keep the runtime validators aligned here without mutating the IA schemas in this task.

URL_RULE = FieldRule(max_length=2000, safe_url=True, sanitizer=None)
PLAIN_RULE = FieldRule(max_length=PLAIN_TEXT_MAX)
RICH_RULE = FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text)
BUTTON_RULE = FieldRule(max_length=BUTTON_TEXT_MAX)
PLACEHOLDER_RULE = FieldRule(max_length=PLACEHOLDER_MAX)
NAME_RULE = FieldRule(max_length=NAME_MAX)


def validate_navbar_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('navbar', data, {
        'brandName': NAME_RULE,
        'logoImage': URL_RULE,
        'link1': PLAIN_RULE,
        'link2': PLAIN_RULE,
        'link3': PLAIN_RULE,
        'ctaText': BUTTON_RULE,
    }, partial=partial)


def validate_hero_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('hero', data, {
        'title': FieldRule(max_length=PLAIN_TEXT_MAX, allow_null=False),
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'buttonText': BUTTON_RULE,
        'badgeText': BUTTON_RULE,
        'secondaryButtonText': BUTTON_RULE,
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
        'feature1Title': PLAIN_RULE,
        'feature1Desc': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'feature2Title': PLAIN_RULE,
        'feature2Desc': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
    }, partial=partial)


def validate_testimonials_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('testimonials', data, {
        'title': PLAIN_RULE,
        'quote1': FieldRule(max_length=QUOTE_MAX, sanitizer=sanitize_text),
        'author1': NAME_RULE,
        'role1': PLAIN_RULE,
        'quote2': FieldRule(max_length=QUOTE_MAX, sanitizer=sanitize_text),
        'author2': NAME_RULE,
        'role2': PLAIN_RULE,
    }, partial=partial)


def validate_cta_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('cta', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'buttonText': BUTTON_RULE,
    }, partial=partial)


def validate_footer_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('footer', data, {
        'brandName': NAME_RULE,
        'description': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'copyright': FieldRule(max_length=COPYRIGHT_MAX),
        'link1Label': PLAIN_RULE,
        'link2Label': PLAIN_RULE,
        'link3Label': PLAIN_RULE,
    }, partial=partial)


def validate_pricing_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('pricing', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'plan1Name': NAME_RULE,
        'plan1Price': PLAIN_RULE,
        'plan1Features': FieldRule(max_length=FAQ_ANSWER_MAX, sanitizer=sanitize_text),
        'plan1ButtonText': BUTTON_RULE,
        'plan2Name': NAME_RULE,
        'plan2Price': PLAIN_RULE,
        'plan2Features': FieldRule(max_length=FAQ_ANSWER_MAX, sanitizer=sanitize_text),
        'plan2ButtonText': BUTTON_RULE,
        'plan2Highlighted': FieldRule(kind='boolean'),
        'billingPeriod': PLAIN_RULE,
        'popularBadgeText': BUTTON_RULE,
    }, partial=partial)


def validate_faq_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('faq', data, {
        'title': PLAIN_RULE,
        'q1': FieldRule(max_length=FAQ_QUESTION_MAX),
        'a1': FieldRule(max_length=FAQ_ANSWER_MAX, sanitizer=sanitize_text),
        'q2': FieldRule(max_length=FAQ_QUESTION_MAX),
        'a2': FieldRule(max_length=FAQ_ANSWER_MAX, sanitizer=sanitize_text),
        'q3': FieldRule(max_length=FAQ_QUESTION_MAX),
        'a3': FieldRule(max_length=FAQ_ANSWER_MAX, sanitizer=sanitize_text),
    }, partial=partial)


def validate_logo_cloud_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('logoCloud', data, {
        'title': PLAIN_RULE,
        'logo1': NAME_RULE,
        'logo2': NAME_RULE,
        'logo3': NAME_RULE,
        'logo4': NAME_RULE,
        'logo5': NAME_RULE,
    }, partial=partial)


def validate_gallery_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('gallery', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'columns': FieldRule(
            max_length=1,
            choices=('2', '3', '4'),
            sanitizer=sanitize_plain_text,
            coerce_to_string=True,
        ),
        'image1': URL_RULE,
        'image2': URL_RULE,
        'image3': URL_RULE,
        'image4': URL_RULE,
        'image5': URL_RULE,
        'image6': URL_RULE,
    }, partial=partial)


def validate_contact_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('contact', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
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
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'member1Name': NAME_RULE,
        'member1Role': PLAIN_RULE,
        'member1Image': URL_RULE,
        'member2Name': NAME_RULE,
        'member2Role': PLAIN_RULE,
        'member2Image': URL_RULE,
        'member3Name': NAME_RULE,
        'member3Role': PLAIN_RULE,
        'member3Image': URL_RULE,
    }, partial=partial)


def validate_stats_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('stats', data, {
        'title': PLAIN_RULE,
        'subtitle': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'stat1Value': PLAIN_RULE,
        'stat1Label': PLAIN_RULE,
        'stat2Value': PLAIN_RULE,
        'stat2Label': PLAIN_RULE,
        'stat3Value': PLAIN_RULE,
        'stat3Label': PLAIN_RULE,
        'stat4Value': PLAIN_RULE,
        'stat4Label': PLAIN_RULE,
    }, partial=partial)


def validate_timeline_data(data: dict, *, partial: bool = False) -> dict:
    return _validate_fields('timeline', data, {
        'title': PLAIN_RULE,
        'item1Date': PLAIN_RULE,
        'item1Title': PLAIN_RULE,
        'item1Desc': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'item2Date': PLAIN_RULE,
        'item2Title': PLAIN_RULE,
        'item2Desc': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
        'item3Date': PLAIN_RULE,
        'item3Title': PLAIN_RULE,
        'item3Desc': FieldRule(max_length=RICH_TEXT_MAX, sanitizer=sanitize_text),
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


def validate_block_data(block_type: str | None, data: dict, *, partial: bool = False) -> dict:
    if not block_type:
        return data
    validator = BLOCK_VALIDATORS.get(block_type)
    if validator is None:
        return data
    return validator(data, partial=partial)

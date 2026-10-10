"""Validation of Page.design_tokens, the only theme system of a page.

The tokens are written by the editor and rendered as CSS custom properties
(colours and lengths inside style attributes) on the public page, so the
server accepts nothing but known keys with values of a known shape.

Shape (snake_case, as produced by tokensToApi in frontend/lib/design-tokens.ts):
    {"colors": {...}, "typography": {...}, "spacing": {...}, "borders": {...}}
A group or a key may be missing (the client fills in defaults); `{}` means
"no custom tokens". Unknown groups and keys are dropped, invalid values are
rejected.
"""
from __future__ import annotations

import re

from rest_framework import serializers

COLOR_KEYS = (
    'primary', 'secondary', 'accent', 'background', 'surface',
    'text_primary', 'text_secondary', 'text_on_primary', 'border',
    'success', 'error',
)

# Keep in sync with `googleFonts` in frontend/lib/design-tokens.ts: the list
# the editor offers and lib/page-fonts.ts self-hosts.
ALLOWED_FONTS = (
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
    'Source Sans 3', 'Nunito', 'Playfair Display', 'Merriweather', 'DM Sans',
    'Space Grotesk', 'Outfit', 'Plus Jakarta Sans', 'Manrope', 'Sora',
    'Work Sans', 'Archivo', 'Libre Baskerville',
)

# Keep in sync with `scaleRatios` in frontend/lib/design-tokens.ts
ALLOWED_SCALE_RATIOS = (1.2, 1.25, 1.333, 1.5, 1.618)

# Always use fullmatch with these: `$` also matches before a trailing newline,
# so `.match` let "#fff\n" through (SEC2-010)
HEX_COLOR_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
# A CSS length: digits, optional decimals, a unit. Nothing that could close a
# declaration or open a function.
LENGTH_RE = re.compile(r'^(\d{1,5}(?:\.\d{1,3})?)(px|rem|em|%)$')
MAX_LENGTH_VALUE = 10_000

SPACING_KEYS = ('section_padding_y', 'section_padding_x', 'max_content_width')
BORDER_KEYS = ('radius_sm', 'radius_md', 'radius_lg', 'radius_full')

BASE_SIZE_RANGE = (10, 32)
WEIGHT_RANGE = (100, 900)  # multiples of 100
LINE_HEIGHT_RANGE = (0.8, 3.0)


def _is_number(value) -> bool:
    # bool is an int subclass: True must not pass as 1
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_whole_number(value) -> bool:
    return _is_number(value) and float(value).is_integer()


def _color(value):
    if not isinstance(value, str) or not HEX_COLOR_RE.fullmatch(value):
        raise ValueError('Debe ser un color hexadecimal (#rgb, #rrggbb o #rrggbbaa).')
    return value


def _length(value):
    match = LENGTH_RE.fullmatch(value) if isinstance(value, str) else None
    if not match or float(match.group(1)) > MAX_LENGTH_VALUE:
        raise ValueError('Debe ser una medida CSS válida (por ejemplo 16px o 1.5rem).')
    return value


def _font(value):
    if value not in ALLOWED_FONTS:
        raise ValueError('Fuente no disponible.')
    return value


def _base_size(value):
    low, high = BASE_SIZE_RANGE
    if not _is_whole_number(value) or not low <= value <= high:
        raise ValueError(f'Debe ser un entero entre {low} y {high}.')
    return int(value)


def _scale_ratio(value):
    if not _is_number(value) or value not in ALLOWED_SCALE_RATIOS:
        allowed = ', '.join(str(ratio) for ratio in ALLOWED_SCALE_RATIOS)
        raise ValueError(f'Debe ser una de: {allowed}.')
    return value


def _weight(value):
    low, high = WEIGHT_RANGE
    if not _is_whole_number(value) or not low <= value <= high or value % 100:
        raise ValueError('Debe ser un múltiplo de 100 entre 100 y 900.')
    return int(value)


def _line_height(value):
    low, high = LINE_HEIGHT_RANGE
    if not _is_number(value) or not low <= value <= high:
        raise ValueError(f'Debe estar entre {low} y {high}.')
    return value


GROUP_RULES = {
    'colors': {key: _color for key in COLOR_KEYS},
    'typography': {
        'heading_font': _font,
        'body_font': _font,
        'base_size': _base_size,
        'scale_ratio': _scale_ratio,
        'heading_weight': _weight,
        'body_weight': _weight,
        'line_height_heading': _line_height,
        'line_height_body': _line_height,
    },
    'spacing': {key: _length for key in SPACING_KEYS},
    'borders': {key: _length for key in BORDER_KEYS},
}


def clean_design_tokens(value) -> dict:
    """Return `value` without unknown keys, or raise a ValidationError that
    names every invalid field as {group: {key: [messages]}}."""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError('design_tokens debe ser un objeto JSON.')

    cleaned: dict = {}
    errors: dict = {}
    for group, rules in GROUP_RULES.items():
        if group not in value:
            continue
        raw_group = value[group]
        if not isinstance(raw_group, dict):
            errors[group] = ['Debe ser un objeto.']
            continue
        cleaned_group: dict = {}
        group_errors: dict = {}
        for key, rule in rules.items():
            if key not in raw_group:
                continue
            try:
                cleaned_group[key] = rule(raw_group[key])
            except ValueError as exc:
                group_errors[key] = [str(exc)]
        if group_errors:
            errors[group] = group_errors
        else:
            cleaned[group] = cleaned_group

    if errors:
        raise serializers.ValidationError(errors)
    return cleaned

"""One theme system: design tokens only.

Pages used to have two: a legacy theme (`theme_id` + `custom_theme`) and
design tokens (`design_tokens`, `{}` = none). This gives every page that has
no tokens the tokens equivalent to its legacy theme, does the same for the
page metadata of every PageVersion (published copies included: the public
page renders them), and drops the two legacy columns.

Self-contained on purpose: the palettes and defaults below are a frozen copy
of the legacy `themes.ts` and of the token defaults, so later changes to
app code cannot alter what this migration does.

Not atomic so the data step and the column drops run in separate
transactions (PostgreSQL refuses to ALTER a table with pending trigger
events). The data step only fills empty tokens, so it is safe to re-run.
"""
import re

from django.db import migrations, models

BATCH_SIZE = 200

# --- Frozen copy of the legacy themes (frontend/lib/themes.ts). primaryHover
# is not carried over: no block ever read --theme-primary-hover.
LEGACY_THEMES = {
    'default': {
        'primary': '#4f46e5', 'secondary': '#8b5cf6', 'background': '#ffffff', 'surface': '#f9fafb',
        'text': '#18181b', 'textMuted': '#71717a', 'border': '#e4e4e7', 'accent': '#6366f1',
    },
    'ocean': {
        'primary': '#0891b2', 'secondary': '#06b6d4', 'background': '#ffffff', 'surface': '#f0fdfa',
        'text': '#134e4a', 'textMuted': '#5eead4', 'border': '#ccfbf1', 'accent': '#14b8a6',
    },
    'sunset': {
        'primary': '#ea580c', 'secondary': '#f97316', 'background': '#fffbeb', 'surface': '#fef3c7',
        'text': '#78350f', 'textMuted': '#92400e', 'border': '#fde68a', 'accent': '#f59e0b',
    },
    'forest': {
        'primary': '#16a34a', 'secondary': '#22c55e', 'background': '#ffffff', 'surface': '#f0fdf4',
        'text': '#14532d', 'textMuted': '#166534', 'border': '#bbf7d0', 'accent': '#4ade80',
    },
    'dark': {
        'primary': '#818cf8', 'secondary': '#a78bfa', 'background': '#18181b', 'surface': '#27272a',
        'text': '#fafafa', 'textMuted': '#a1a1aa', 'border': '#3f3f46', 'accent': '#c084fc',
    },
    'slate': {
        'primary': '#14b8a6', 'secondary': '#06b6d4', 'background': '#0f172a', 'surface': '#1e293b',
        'text': '#f1f5f9', 'textMuted': '#94a3b8', 'border': '#334155', 'accent': '#2dd4bf',
    },
    'ember': {
        'primary': '#ea580c', 'secondary': '#f59e0b', 'background': '#0c0a09', 'surface': '#1c1917',
        'text': '#fafaf9', 'textMuted': '#a8a29e', 'border': '#292524', 'accent': '#fb923c',
    },
    'rose': {
        'primary': '#e11d48', 'secondary': '#f43f5e', 'background': '#ffffff', 'surface': '#fff1f2',
        'text': '#1c1917', 'textMuted': '#78716c', 'border': '#fecdd3', 'accent': '#fb7185',
    },
}
DEFAULT_THEME_ID = 'default'

# --- Frozen defaults of the other token groups (frontend/lib/design-tokens.ts)
SUCCESS_COLOR = '#10b981'
ERROR_COLOR = '#ef4444'
LIGHT_ON_PRIMARY = '#ffffff'
DARK_ON_PRIMARY = '#0f172a'
# Defaults of the colours before the 'default' preset replaced them. Only used
# to complete tokens that were stored without some colours.
OLD_DEFAULT_COLORS = {
    'primary': '#4f46e5', 'secondary': '#7c3aed', 'accent': '#f59e0b',
    'background': '#ffffff', 'surface': '#f8fafc', 'text_primary': '#0f172a',
    'text_secondary': '#64748b', 'text_on_primary': '#ffffff', 'border': '#e2e8f0',
    'success': '#10b981', 'error': '#ef4444',
}
DEFAULT_TYPOGRAPHY = {
    'heading_font': 'Inter',
    'body_font': 'Inter',
    'base_size': 16,
    'scale_ratio': 1.25,
    'heading_weight': 700,
    'body_weight': 400,
    'line_height_heading': 1.2,
    'line_height_body': 1.6,
}
DEFAULT_SPACING = {
    'section_padding_y': '80px',
    'section_padding_x': '24px',
    'max_content_width': '1200px',
}
DEFAULT_BORDERS = {
    'radius_sm': '4px',
    'radius_md': '8px',
    'radius_lg': '16px',
    'radius_full': '9999px',
}
OLD_DEFAULT_TOKENS = {
    'colors': OLD_DEFAULT_COLORS,
    'typography': DEFAULT_TYPOGRAPHY,
    'spacing': DEFAULT_SPACING,
    'borders': DEFAULT_BORDERS,
}

HEX_COLOR_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')


def _luminance(color):
    h = color[1:7] if len(color) >= 7 else ''.join(ch * 2 for ch in color[1:4])
    channels = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _contrast(color_a, color_b):
    a, b = _luminance(color_a), _luminance(color_b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def text_on(color):
    """White when it reaches WCAG AA (4.5:1) on `color`, else whichever of
    white and near-black contrasts more."""
    if _contrast(LIGHT_ON_PRIMARY, color) >= 4.5:
        return LIGHT_ON_PRIMARY
    if _contrast(DARK_ON_PRIMARY, color) > _contrast(LIGHT_ON_PRIMARY, color):
        return DARK_ON_PRIMARY
    return LIGHT_ON_PRIMARY


def legacy_theme_colors(theme_id, custom_theme):
    """The 8 colours (legacy camelCase keys) a page rendered with, mirroring
    getThemeById: 'custom' uses custom_theme, an unknown id falls back to
    the default theme. Missing or invalid custom colours use the default."""
    base = LEGACY_THEMES[DEFAULT_THEME_ID]
    if theme_id == 'custom' and isinstance(custom_theme, dict):
        return {
            key: custom_theme[key]
            if isinstance(custom_theme.get(key), str) and HEX_COLOR_RE.match(custom_theme[key])
            else value
            for key, value in base.items()
        }
    return LEGACY_THEMES.get(theme_id, base) if isinstance(theme_id, str) else base


def legacy_theme_to_tokens(theme_id, custom_theme):
    """Design tokens (API snake_case format) that render like the legacy theme."""
    colors = legacy_theme_colors(theme_id, custom_theme)
    return {
        'colors': {
            'primary': colors['primary'],
            'secondary': colors['secondary'],
            'accent': colors['accent'],
            'background': colors['background'],
            'surface': colors['surface'],
            'text_primary': colors['text'],
            'text_secondary': colors['textMuted'],
            'text_on_primary': text_on(colors['primary']),
            'border': colors['border'],
            'success': SUCCESS_COLOR,
            'error': ERROR_COLOR,
        },
        'typography': dict(DEFAULT_TYPOGRAPHY),
        'spacing': dict(DEFAULT_SPACING),
        'borders': dict(DEFAULT_BORDERS),
    }


def complete_tokens(tokens):
    """Tokens already stored, made complete and valid: a colour typed halfway
    ('#12') is dropped because the API now rejects it and it would block every
    later save of the page, and missing keys are filled with the defaults the
    editor used until now, so the page keeps rendering the same even if the
    app's defaults change."""
    if not isinstance(tokens, dict):
        return tokens
    filled = {}
    for group, defaults in OLD_DEFAULT_TOKENS.items():
        stored = tokens.get(group)
        if not isinstance(stored, dict):
            stored = {}
        stored = {
            key: value for key, value in stored.items()
            if not (group == 'colors' and key in defaults
                    and not (isinstance(value, str) and HEX_COLOR_RE.match(value)))
        }
        filled[group] = {**defaults, **stored}
    return filled


def convert_pages(apps, schema_editor):
    Page = apps.get_model('pages', 'Page')
    PageVersion = apps.get_model('pages', 'PageVersion')

    pages = []
    for page in Page.objects.only('id', 'theme_id', 'custom_theme', 'design_tokens').iterator():
        if page.design_tokens:
            tokens = complete_tokens(page.design_tokens)
        else:
            tokens = legacy_theme_to_tokens(page.theme_id, page.custom_theme)
        if tokens != page.design_tokens:
            page.design_tokens = tokens
            pages.append(page)
        if len(pages) >= BATCH_SIZE:
            Page.objects.bulk_update(pages, ['design_tokens'])
            pages = []
    if pages:
        Page.objects.bulk_update(pages, ['design_tokens'])

    versions = []
    for version in PageVersion.objects.only('id', 'page_metadata').iterator():
        meta = version.page_metadata
        if not isinstance(meta, dict) or not meta:
            continue  # nothing frozen: readers fall back to the (converted) page
        tokens = meta.get('design_tokens')
        if tokens:
            tokens = complete_tokens(tokens)
        else:
            tokens = legacy_theme_to_tokens(meta.get('theme_id'), meta.get('custom_theme'))
        new_meta = {k: v for k, v in meta.items() if k not in ('theme_id', 'custom_theme')}
        new_meta['design_tokens'] = tokens
        if new_meta != meta:
            version.page_metadata = new_meta
            versions.append(version)
        if len(versions) >= BATCH_SIZE:
            PageVersion.objects.bulk_update(versions, ['page_metadata'])
            versions = []
    if versions:
        PageVersion.objects.bulk_update(versions, ['page_metadata'])


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('pages', '0013_freeze_published_pages'),
    ]

    operations = [
        # The tokens now carry the theme, so going back only needs the columns
        # (with their defaults); the old code prefers tokens when a page has them.
        migrations.RunPython(convert_pages, migrations.RunPython.noop),
        migrations.RemoveField(model_name='page', name='theme_id'),
        migrations.RemoveField(model_name='page', name='custom_theme'),
        migrations.AlterField(
            model_name='pageversion',
            name='page_metadata',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='Page-level fields at the time of snapshot (name, slug, design_tokens, etc.)',
            ),
        ),
    ]

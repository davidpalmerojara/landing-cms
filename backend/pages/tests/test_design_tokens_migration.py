"""The data migration that replaced theme_id + custom_theme with design tokens."""
import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader

from pages.design_tokens import clean_design_tokens


def _migration_name():
    """Looked up by suffix so renumbering the migration does not break the test."""
    loader = MigrationLoader(None)  # no connection: reads the files only
    names = [name for app, name in loader.graph.nodes if app == 'pages' and name.endswith('_design_tokens_only')]
    assert len(names) == 1
    return names[0]


@pytest.fixture(scope='module')
def migration():
    return importlib.import_module(f'pages.migrations.{_migration_name()}')


# The legacy palettes as the old editor rendered them (frontend/lib/themes.ts)
# and the --theme-* values each one must still produce.
LEGACY_RENDERING = {
    'default': ('#4f46e5', '#8b5cf6', '#ffffff', '#f9fafb', '#18181b', '#71717a', '#e4e4e7', '#6366f1'),
    'ocean': ('#0891b2', '#06b6d4', '#ffffff', '#f0fdfa', '#134e4a', '#5eead4', '#ccfbf1', '#14b8a6'),
    'sunset': ('#ea580c', '#f97316', '#fffbeb', '#fef3c7', '#78350f', '#92400e', '#fde68a', '#f59e0b'),
    'forest': ('#16a34a', '#22c55e', '#ffffff', '#f0fdf4', '#14532d', '#166534', '#bbf7d0', '#4ade80'),
    'dark': ('#818cf8', '#a78bfa', '#18181b', '#27272a', '#fafafa', '#a1a1aa', '#3f3f46', '#c084fc'),
    'slate': ('#14b8a6', '#06b6d4', '#0f172a', '#1e293b', '#f1f5f9', '#94a3b8', '#334155', '#2dd4bf'),
    'ember': ('#ea580c', '#f59e0b', '#0c0a09', '#1c1917', '#fafaf9', '#a8a29e', '#292524', '#fb923c'),
    'rose': ('#e11d48', '#f43f5e', '#ffffff', '#fff1f2', '#1c1917', '#78716c', '#fecdd3', '#fb7185'),
}
COLOR_ORDER = ('primary', 'secondary', 'background', 'surface', 'text_primary', 'text_secondary', 'border', 'accent')


class TestLegacyThemeToTokens:
    @pytest.mark.parametrize('theme_id', sorted(LEGACY_RENDERING))
    def test_every_legacy_theme_keeps_its_colors(self, migration, theme_id):
        tokens = migration.legacy_theme_to_tokens(theme_id, {})

        assert tuple(tokens['colors'][key] for key in COLOR_ORDER) == LEGACY_RENDERING[theme_id]

    @pytest.mark.parametrize('theme_id', sorted(LEGACY_RENDERING))
    def test_the_converted_tokens_pass_the_api_validation(self, migration, theme_id):
        tokens = migration.legacy_theme_to_tokens(theme_id, {})

        assert clean_design_tokens(tokens) == tokens

    def test_text_on_primary_is_the_most_readable_of_white_and_near_black(self, migration):
        assert migration.legacy_theme_to_tokens('default', {})['colors']['text_on_primary'] == '#ffffff'
        assert migration.legacy_theme_to_tokens('dark', {})['colors']['text_on_primary'] == '#0f172a'
        for theme_id in LEGACY_RENDERING:
            colors = migration.legacy_theme_to_tokens(theme_id, {})['colors']
            chosen = migration._contrast(colors['text_on_primary'], colors['primary'])
            assert chosen >= max(
                migration._contrast('#ffffff', colors['primary']),
                migration._contrast('#0f172a', colors['primary']),
            ) or chosen >= 4.5

    def test_typography_spacing_and_borders_are_the_old_defaults(self, migration):
        tokens = migration.legacy_theme_to_tokens('ember', {})

        assert tokens['typography']['heading_font'] == 'Inter'
        assert tokens['typography']['scale_ratio'] == 1.25
        assert tokens['spacing']['section_padding_y'] == '80px'
        assert tokens['borders']['radius_full'] == '9999px'

    def test_custom_theme_uses_its_own_colors(self, migration):
        custom = {
            'primary': '#112233', 'primaryHover': '#001122', 'secondary': '#334455', 'background': '#fafafa',
            'surface': '#eeeeee', 'text': '#101010', 'textMuted': '#505050', 'border': '#dddddd', 'accent': '#abcdef',
        }
        tokens = migration.legacy_theme_to_tokens('custom', custom)

        assert tuple(tokens['colors'][key] for key in COLOR_ORDER) == (
            '#112233', '#334455', '#fafafa', '#eeeeee', '#101010', '#505050', '#dddddd', '#abcdef',
        )
        assert tokens['colors']['text_on_primary'] == '#ffffff'

    def test_custom_theme_with_missing_or_invalid_colors_falls_back_to_default(self, migration):
        tokens = migration.legacy_theme_to_tokens('custom', {'primary': '#112233', 'text': 'red; x', 'border': 3})
        default = migration.legacy_theme_to_tokens('default', {})

        assert tokens['colors']['primary'] == '#112233'
        assert tokens['colors']['text_primary'] == default['colors']['text_primary']
        assert tokens['colors']['border'] == default['colors']['border']
        assert clean_design_tokens(tokens) == tokens

    def test_custom_id_without_custom_theme_and_unknown_ids_use_the_default_theme(self, migration):
        default = migration.legacy_theme_to_tokens('default', {})

        assert migration.legacy_theme_to_tokens('custom', {}) == default
        assert migration.legacy_theme_to_tokens('custom', None) == default
        assert migration.legacy_theme_to_tokens('nonexistent', {}) == default
        assert migration.legacy_theme_to_tokens(None, None) == default

    def test_custom_theme_is_ignored_unless_the_id_is_custom(self, migration):
        tokens = migration.legacy_theme_to_tokens('dark', {'primary': '#000000'})

        assert tokens['colors']['primary'] == '#818cf8'


class TestCompleteTokens:
    def test_missing_keys_get_the_old_defaults(self, migration):
        tokens = migration.complete_tokens({'typography': {'heading_font': 'Playfair Display'}})

        assert tokens['typography']['heading_font'] == 'Playfair Display'
        assert tokens['typography']['body_font'] == 'Inter'
        assert tokens['colors']['surface'] == '#f8fafc'
        assert clean_design_tokens(tokens) == tokens

    def test_half_typed_colors_are_replaced_so_later_saves_are_not_rejected(self, migration):
        tokens = migration.complete_tokens({'colors': {'primary': '#12', 'accent': '#abcdef'}})

        assert tokens['colors']['primary'] == '#4f46e5'
        assert tokens['colors']['accent'] == '#abcdef'

    def test_complete_valid_tokens_are_a_fixed_point(self, migration):
        tokens = migration.legacy_theme_to_tokens('forest', {})

        assert migration.complete_tokens(tokens) == tokens


@pytest.mark.django_db(transaction=True)
def test_migration_converts_pages_and_versions_and_drops_the_columns():
    name = _migration_name()
    executor = MigrationExecutor(connection)
    before = executor.loader.graph.node_map[('pages', name)].parents
    (before_target,) = [parent.key for parent in before if parent.key[0] == 'pages']

    executor.migrate([before_target])
    old_apps = executor.loader.project_state([before_target]).apps
    Page = old_apps.get_model('pages', 'Page')
    PageVersion = old_apps.get_model('pages', 'PageVersion')

    dark = Page.objects.create(name='Dark', slug='dark', theme_id='dark')
    custom = Page.objects.create(
        name='Custom', slug='custom', theme_id='custom',
        custom_theme={'primary': '#112233', 'background': '#fafafa'},
    )
    keeps = Page.objects.create(
        name='Keeps', slug='keeps', theme_id='ember',
        design_tokens={'colors': {'primary': '#000000'}, 'typography': {'heading_font': 'Sora'}},
    )
    published_copy = PageVersion.objects.create(
        page=dark, version_number=1, snapshot=[],
        page_metadata={'name': 'Dark', 'theme_id': 'slate', 'custom_theme': {}, 'design_tokens': {}},
    )
    with_tokens = PageVersion.objects.create(
        page=keeps, version_number=1, snapshot=[],
        page_metadata={'name': 'Keeps', 'theme_id': 'ember', 'design_tokens': {'colors': {'primary': '#000000'}}},
    )
    without_metadata = PageVersion.objects.create(page=keeps, version_number=2, snapshot=[], page_metadata={})

    executor = MigrationExecutor(connection)
    executor.migrate([('pages', name)])
    new_apps = executor.loader.project_state([('pages', name)]).apps
    Page = new_apps.get_model('pages', 'Page')
    PageVersion = new_apps.get_model('pages', 'PageVersion')

    assert not hasattr(Page, 'theme_id') and not hasattr(Page, 'custom_theme')
    assert Page.objects.get(pk=dark.pk).design_tokens['colors']['background'] == '#18181b'
    converted_custom = Page.objects.get(pk=custom.pk).design_tokens['colors']
    assert (converted_custom['primary'], converted_custom['background']) == ('#112233', '#fafafa')

    kept = Page.objects.get(pk=keeps.pk).design_tokens
    assert kept['colors']['primary'] == '#000000'
    assert kept['typography']['heading_font'] == 'Sora'
    assert kept['borders']['radius_md'] == '8px'  # completed, still ember-agnostic

    frozen = PageVersion.objects.get(pk=published_copy.pk).page_metadata
    assert frozen['design_tokens']['colors']['background'] == '#0f172a'  # slate: the version's own theme
    assert 'theme_id' not in frozen and 'custom_theme' not in frozen
    assert frozen['name'] == 'Dark'

    assert PageVersion.objects.get(pk=with_tokens.pk).page_metadata['design_tokens']['colors']['primary'] == '#000000'
    assert PageVersion.objects.get(pk=without_metadata.pk).page_metadata == {}

    # Leave the schema as the other tests expect it
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())

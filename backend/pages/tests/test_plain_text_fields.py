"""QA-001 / D6: the long text fields are plain text.

They used to be saved as sanitized HTML (`&` -> `&amp;`), and every block
renders them as React text, so visitors saw `Q&amp;A`. Now they are stored as
typed, never change on a second save, and migration 0018 turns what was
stored into the text it showed.
"""
import copy
import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from pages.block_validators import clean_block_data
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

migration = importlib.import_module('pages.migrations.0018_plain_text_and_safe_image_urls')

TYPED = 'Q&A <3 "x" 5>3'

# block type -> builder of data with TYPED in every former rich-text field, and a reader of those fields
CASES = [
    pytest.param('hero', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='hero.subtitle'),
    pytest.param('cta', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='cta.subtitle'),
    pytest.param('footer', lambda t: {'description': t}, lambda d: [d['description']], id='footer.description'),
    pytest.param('gallery', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='gallery.subtitle'),
    pytest.param('contact', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='contact.subtitle'),
    pytest.param('team', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='team.subtitle'),
    pytest.param('stats', lambda t: {'subtitle': t}, lambda d: [d['subtitle']], id='stats.subtitle'),
    pytest.param('pricing', lambda t: {'subtitle': t, 'plans': [{'features': t}]},
                 lambda d: [d['subtitle'], d['plans'][0]['features']], id='pricing.subtitle+features'),
    pytest.param('faq', lambda t: {'questions': [{'question': 'Q', 'answer': t}]},
                 lambda d: [d['questions'][0]['answer']], id='faq.answer'),
    pytest.param('features', lambda t: {'features': [{'title': 'T', 'description': t}]},
                 lambda d: [d['features'][0]['description']], id='features.description'),
    pytest.param('testimonials', lambda t: {'testimonials': [{'quote': t, 'author': 'A', 'role': 'R'}]},
                 lambda d: [d['testimonials'][0]['quote']], id='testimonials.quote'),
    pytest.param('timeline', lambda t: {'events': [{'date': 'D', 'title': 'T', 'description': t}]},
                 lambda d: [d['events'][0]['description']], id='timeline.description'),
]


@pytest.mark.parametrize(('block_type', 'build', 'read'), CASES)
def test_typed_text_round_trips_unchanged_and_stays_unchanged_on_a_second_save(block_type, build, read):
    # QA-001: hero subtitle, FAQ answer, pricing features and testimonial quote with '&', '<', '"' and '>'
    once = clean_block_data(block_type, build(TYPED))
    assert all(value == TYPED for value in read(once))
    assert clean_block_data(block_type, once) == once


def test_a_literal_entity_typed_by_the_user_is_kept_as_typed():
    data = clean_block_data('hero', {'subtitle': 'Use &amp; for an ampersand'})
    assert data['subtitle'] == 'Use &amp; for an ampersand'


def test_markup_is_removed_not_stored():
    data = clean_block_data('hero', {'subtitle': '<strong>Bold</strong> <a href="javascript:x">link</a><script>y</script>'})
    assert data['subtitle'] == 'Bold linky'


def test_the_api_returns_what_was_typed(auth_client, page):
    blocks = [{'type': 'hero', 'order': 0, 'data': {'title': 'T', 'subtitle': TYPED}, 'styles': {}}]
    response = auth_client.put(
        f'/api/pages/{page.id}/', {'name': page.name, 'blocks': blocks, 'version': page.version}, format='json',
    )
    assert response.status_code == 200, response.data
    assert response.data['blocks'][0]['data']['subtitle'] == TYPED


# --- migration 0018, text ----------------------------------------------------

@pytest.mark.parametrize(('stored', 'shown'), [
    ('A &amp; B', 'A & B'),
    ('Q&amp;A &lt;3 &quot;x&quot; 5&gt;3', 'Q&A <3 "x" 5>3'),
    ('<strong>Bold</strong> and <em>soft</em>', 'Bold and soft'),
    ('<a href="https://x.test" rel="nofollow">link</a>', 'link'),
    ('one<br>two<br />three', 'one\ntwo\nthree'),
    # bleach stored a literal "&amp;lt;" typed by the user as "&amp;lt;": decoded once it is "&lt;"
    ('&amp;lt;', '&lt;'),
    ('plain', 'plain'),
    ('', ''),
])
def test_to_plain_text(stored, shown):
    assert migration.to_plain_text(stored) == shown


def test_to_plain_text_leaves_non_strings_alone():
    assert migration.to_plain_text(None) is None
    assert migration.to_plain_text(5) == 5


def test_convert_block_data_touches_only_the_long_text_fields():
    data = {
        'title': 'A &amp; B',  # plain fields were decoded already when they were saved: not touched
        'subtitle': 'A &amp; B',
        'buttonText': 'Go',
    }
    assert migration.convert_block_data('hero', data) == {'title': 'A &amp; B', 'subtitle': 'A & B', 'buttonText': 'Go'}


def test_convert_block_data_reaches_list_items_and_does_not_mutate_its_input():
    data = {'questions': [{'question': 'Q&amp;A?', 'answer': 'Yes &amp; no'}, {'question': 'Q2', 'answer': '<b>x</b>'}]}
    before = copy.deepcopy(data)
    result = migration.convert_block_data('faq', data)
    assert result == {'questions': [{'question': 'Q&amp;A?', 'answer': 'Yes & no'}, {'question': 'Q2', 'answer': 'x'}]}
    assert data == before


def test_convert_block_data_returns_the_same_object_when_nothing_changes():
    data = {'subtitle': 'already plain', 'title': 'T'}
    assert migration.convert_block_data('hero', data) is data
    assert migration.convert_block_data('customHtml', {'html': '<p>&amp;</p>'}) == {'html': '<p>&amp;</p>'}


def test_convert_snapshot_converts_blocks_and_reports_no_change():
    snapshot = [
        {'id': 'a', 'type': 'cta', 'order': 0, 'data': {'subtitle': 'A &amp; B'}, 'styles': {}},
        {'id': 'b', 'type': 'hero', 'order': 1, 'data': {'title': 'T'}, 'styles': {}},
    ]
    assert migration.convert_snapshot(snapshot)[0]['data'] == {'subtitle': 'A & B'}
    assert migration.convert_snapshot(migration.convert_snapshot(snapshot)) is None
    for odd in ([], None, {}, ['x', {'type': None}]):
        assert migration.convert_snapshot(odd) is None


# --- migration 0018, on rows -------------------------------------------------

def _historical_apps():
    """The models as they are at migration 0018 (what RunPython receives)."""
    executor = MigrationExecutor(connection)
    return executor.loader.project_state([('pages', '0018_plain_text_and_safe_image_urls')]).apps


def _snapshot_of(blocks):
    return [
        {'id': str(b.id), 'type': b.type, 'order': b.order, 'data': copy.deepcopy(b.data), 'styles': {}}
        for b in blocks
    ]


@pytest.mark.django_db
class TestMigrationOnRows:
    def test_blocks_and_every_snapshot_including_the_published_one_are_converted(self):
        page = PageFactory(status='published')
        hero = BlockFactory(page=page, type='hero', order=0, data={'title': 'T', 'subtitle': 'A &amp; B'})
        faq = BlockFactory(page=page, type='faq', order=1, data={
            'questions': [{'question': 'Q', 'answer': '<p>Yes &lt;3</p>'}],
        })
        custom = BlockFactory(page=page, type='customHtml', order=2, data={'html': '<p>&amp;</p>'})
        blocks = [hero, faq, custom]
        draft_version = PageVersionFactory(page=page, version_number=1, snapshot=_snapshot_of(blocks))
        published_version = PageVersionFactory(page=page, version_number=2, snapshot=_snapshot_of(blocks))
        page.published_version = published_version
        page.save(update_fields=['published_version'])
        page.refresh_from_db()
        page_updated_at = page.updated_at

        migration.convert_stored_content(_historical_apps(), None)

        hero.refresh_from_db()
        faq.refresh_from_db()
        custom.refresh_from_db()
        assert hero.data == {'title': 'T', 'subtitle': 'A & B'}
        assert faq.data['questions'][0]['answer'] == 'Yes <3'
        assert custom.data == {'html': '<p>&amp;</p>'}
        for version in (draft_version, published_version):
            version.refresh_from_db()
            by_type = {block['type']: block['data'] for block in version.snapshot}
            assert by_type['hero']['subtitle'] == 'A & B'
            assert by_type['faq']['questions'][0]['answer'] == 'Yes <3'
            assert by_type['customHtml'] == {'html': '<p>&amp;</p>'}
            assert version.size_bytes > 0
        page.refresh_from_db()
        # No save(): the editor does not see the page as edited after publishing
        assert page.updated_at == page_updated_at
        assert page.published_version_id == published_version.id

    def test_converted_data_passes_the_validators_and_is_stable(self):
        data = migration.convert_block_data('faq', {'questions': [{'question': 'Q', 'answer': 'Q&amp;A &lt;3'}]})
        assert clean_block_data('faq', data) == data

    def test_reverse_is_a_noop(self):
        assert migration.Migration.operations[0].reverse_code is migration.migrations.RunPython.noop

    def test_depends_on_the_schema_migration_before_it(self):
        assert ('pages', '0017_page_language_and_og_type_choices') in migration.Migration.dependencies

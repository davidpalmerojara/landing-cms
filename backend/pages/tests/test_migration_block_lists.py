"""Data migration 0014: numbered list keys -> arrays (see the S8 contract)."""
import copy
import importlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from pages.models import PageVersion
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

migration = importlib.import_module('pages.migrations.0014_block_lists_to_arrays')
convert = migration.convert_block_data


# --- the conversion function -------------------------------------------------

FULL_CASES = [
    pytest.param('features', {
        'title': 'T',
        'feature1Title': 'A', 'feature1Desc': 'a',
        'feature2Title': 'B', 'feature2Desc': 'b',
    }, {
        'title': 'T',
        'features': [{'title': 'A', 'description': 'a'}, {'title': 'B', 'description': 'b'}],
    }, id='features'),
    pytest.param('testimonials', {
        'title': 'T',
        'quote1': 'q1', 'author1': 'a1', 'role1': 'r1',
        'quote2': 'q2', 'author2': 'a2', 'role2': 'r2',
    }, {
        'title': 'T',
        'testimonials': [
            {'quote': 'q1', 'author': 'a1', 'role': 'r1'},
            {'quote': 'q2', 'author': 'a2', 'role': 'r2'},
        ],
    }, id='testimonials'),
    pytest.param('pricing', {
        'title': 'T', 'subtitle': 'S', 'billingPeriod': '/mo', 'popularBadgeText': 'Popular',
        'plan1Name': 'Free', 'plan1Price': '0', 'plan1Features': 'a\nb',
        'plan1ButtonText': 'Go', 'plan1ButtonLink': '/free',
        'plan2Name': 'Pro', 'plan2Price': '9', 'plan2Features': 'c',
        'plan2ButtonText': 'Buy', 'plan2ButtonLink': '#pro', 'plan2Highlighted': True,
    }, {
        'title': 'T', 'subtitle': 'S', 'billingPeriod': '/mo', 'popularBadgeText': 'Popular',
        'plans': [
            {'name': 'Free', 'price': '0', 'features': 'a\nb', 'buttonText': 'Go', 'buttonLink': '/free',
             'highlighted': False},
            {'name': 'Pro', 'price': '9', 'features': 'c', 'buttonText': 'Buy', 'buttonLink': '#pro',
             'highlighted': True},
        ],
    }, id='pricing'),
    pytest.param('faq', {
        'title': 'T', 'q1': 'Q1', 'a1': 'A1', 'q2': 'Q2', 'a2': 'A2', 'q3': 'Q3', 'a3': 'A3',
    }, {
        'title': 'T',
        'questions': [
            {'question': 'Q1', 'answer': 'A1'},
            {'question': 'Q2', 'answer': 'A2'},
            {'question': 'Q3', 'answer': 'A3'},
        ],
    }, id='faq'),
    pytest.param('logoCloud', {
        'title': 'T', 'logo1': 'A', 'logo2': 'B', 'logo3': 'C', 'logo4': 'D', 'logo5': 'E',
    }, {
        'title': 'T',
        'logos': [{'name': 'A'}, {'name': 'B'}, {'name': 'C'}, {'name': 'D'}, {'name': 'E'}],
    }, id='logoCloud'),
    pytest.param('team', {
        'title': 'T', 'subtitle': 'S',
        'member1Name': 'Ana', 'member1Role': 'CEO', 'member1Image': 'https://x/a.jpg',
        'member2Name': 'Bo', 'member2Role': 'CTO', 'member2Image': '',
        'member3Name': 'Cy', 'member3Role': 'COO', 'member3Image': '',
    }, {
        'title': 'T', 'subtitle': 'S',
        'members': [
            {'name': 'Ana', 'role': 'CEO', 'image': 'https://x/a.jpg'},
            {'name': 'Bo', 'role': 'CTO', 'image': ''},
            {'name': 'Cy', 'role': 'COO', 'image': ''},
        ],
    }, id='team'),
    pytest.param('stats', {
        'title': 'T',
        'stat1Value': '1', 'stat1Label': 'one', 'stat2Value': '2', 'stat2Label': 'two',
        'stat3Value': '3', 'stat3Label': 'three', 'stat4Value': '4', 'stat4Label': 'four',
    }, {
        'title': 'T',
        'stats': [
            {'value': '1', 'label': 'one'}, {'value': '2', 'label': 'two'},
            {'value': '3', 'label': 'three'}, {'value': '4', 'label': 'four'},
        ],
    }, id='stats'),
    pytest.param('timeline', {
        'title': 'T',
        'item1Date': '2020', 'item1Title': 'A', 'item1Desc': 'a',
        'item2Date': '2021', 'item2Title': 'B', 'item2Desc': 'b',
        'item3Date': '2022', 'item3Title': 'C', 'item3Desc': 'c',
    }, {
        'title': 'T',
        'events': [
            {'date': '2020', 'title': 'A', 'description': 'a'},
            {'date': '2021', 'title': 'B', 'description': 'b'},
            {'date': '2022', 'title': 'C', 'description': 'c'},
        ],
    }, id='timeline'),
    pytest.param('navbar', {
        'brandName': 'Acme', 'logoImage': '', 'ctaText': 'Go', 'ctaLink': '/go',
        'link1': 'Docs', 'link2': 'Blog', 'link3': 'About',
        'link1Url': '/docs', 'link2Url': '/blog', 'link3Url': '#about',
    }, {
        'brandName': 'Acme', 'logoImage': '', 'ctaText': 'Go', 'ctaLink': '/go',
        'links': [
            {'label': 'Docs', 'url': '/docs'},
            {'label': 'Blog', 'url': '/blog'},
            {'label': 'About', 'url': '#about'},
        ],
    }, id='navbar'),
    pytest.param('footer', {
        'brandName': 'Acme', 'description': 'D', 'copyright': 'C',
        'link1Label': 'Terms', 'link2Label': 'Privacy', 'link3Label': 'Contact',
        'link1Url': '/terms', 'link2Url': '/privacy', 'link3Url': 'mailto:a@b.com',
    }, {
        'brandName': 'Acme', 'description': 'D', 'copyright': 'C',
        'links': [
            {'label': 'Terms', 'url': '/terms'},
            {'label': 'Privacy', 'url': '/privacy'},
            {'label': 'Contact', 'url': 'mailto:a@b.com'},
        ],
    }, id='footer'),
    pytest.param('gallery', {
        'title': 'T', 'subtitle': 'S', 'columns': '3',
        'image1': 'https://x/1.jpg', 'image2': '', 'image3': 'https://x/3.jpg',
        'image4': '', 'image5': '', 'image6': 'https://x/6.jpg',
    }, {
        'title': 'T', 'subtitle': 'S', 'columns': '3',
        'images': [
            {'src': 'https://x/1.jpg', 'alt': ''}, {'src': '', 'alt': ''}, {'src': 'https://x/3.jpg', 'alt': ''},
            {'src': '', 'alt': ''}, {'src': '', 'alt': ''}, {'src': 'https://x/6.jpg', 'alt': ''},
        ],
    }, id='gallery'),
]


@pytest.mark.parametrize(('block_type', 'old', 'new'), FULL_CASES)
def test_converts_every_list_block(block_type, old, new):
    assert convert(block_type, old) == new


@pytest.mark.parametrize(('block_type', 'old', 'new'), FULL_CASES)
def test_is_idempotent(block_type, old, new):
    once = convert(block_type, old)
    assert convert(block_type, once) == new
    assert convert(block_type, once) is once


@pytest.mark.parametrize(('block_type', 'old', 'new'), FULL_CASES)
def test_does_not_mutate_its_input(block_type, old, new):
    before = copy.deepcopy(old)
    convert(block_type, old)
    assert old == before


@pytest.mark.parametrize(('block_type', 'old', 'new'), FULL_CASES)
def test_result_has_no_numbered_keys_left(block_type, old, new):
    result = convert(block_type, old)
    assert not [key for key in result if any(char.isdigit() for char in key)]


def test_new_data_is_left_untouched():
    data = {'features': [{'title': 'A', 'description': 'a'}]}
    assert convert('features', data) is data
    # Even next to stale numbered keys: "already in the new format" wins
    mixed = {'features': [], 'feature1Title': 'Stale'}
    assert convert('features', mixed) is mixed


@pytest.mark.parametrize('block_type', ['hero', 'cta', 'contact', 'customHtml', 'unknownType', ''])
def test_blocks_without_lists_and_unknown_types_are_untouched(block_type):
    data = {'title': 'T', 'feature1Title': 'x', 'q1': 'x', 'link1': 'x'}
    assert convert(block_type, data) is data


@pytest.mark.parametrize('data', [None, [], 'text', 5])
def test_non_dict_data_is_returned_as_is(data):
    assert convert('features', data) is data


@pytest.mark.parametrize(('block_type', 'key'), [
    ('features', 'features'), ('testimonials', 'testimonials'), ('pricing', 'plans'),
    ('faq', 'questions'), ('logoCloud', 'logos'), ('team', 'members'), ('stats', 'stats'),
    ('timeline', 'events'), ('navbar', 'links'), ('footer', 'links'),
])
def test_empty_data_gets_an_empty_list(block_type, key):
    assert convert(block_type, {}) == {key: []}


def test_empty_gallery_gets_the_six_empty_slots_of_three_columns():
    assert convert('gallery', {}) == {'images': [{'src': '', 'alt': ''}] * 6}


def test_partial_data_keeps_other_fields_and_found_items():
    result = convert('features', {'title': 'T', 'feature1Title': 'A'})
    assert result == {'title': 'T', 'features': [{'title': 'A', 'description': ''}]}


def test_item_exists_if_any_of_its_keys_is_present():
    result = convert('testimonials', {'author1': 'Jane'})
    assert result == {'testimonials': [{'quote': '', 'author': 'Jane', 'role': ''}]}


def test_a_gap_keeps_the_position_of_the_items():
    # plan2 exists, plan1 does not: plan2 stays second so plan2Highlighted -> plans[1]
    result = convert('pricing', {'plan2Name': 'Pro', 'plan2Highlighted': True})
    assert [plan['name'] for plan in result['plans']] == ['', 'Pro']
    assert [plan['highlighted'] for plan in result['plans']] == [False, True]


def test_pricing_highlighted_defaults_to_false_and_honours_plan1():
    result = convert('pricing', {'plan1Name': 'A', 'plan2Name': 'B'})
    assert [plan['highlighted'] for plan in result['plans']] == [False, False]
    result = convert('pricing', {'plan1Name': 'A', 'plan1Highlighted': True, 'plan2Highlighted': False})
    assert [plan['highlighted'] for plan in result['plans']] == [True, False]


def test_pricing_highlighted_only_true_is_true():
    for value in ('true', 1, 'yes', None):
        result = convert('pricing', {'plan2Name': 'B', 'plan2Highlighted': value})
        assert result['plans'][1]['highlighted'] is False


def test_items_beyond_twelve_are_not_scanned():
    data = {f'logo{n}': f'L{n}' for n in range(1, 16)}
    assert len(convert('logoCloud', data)['logos']) == 12


def test_non_string_values_become_strings():
    result = convert('stats', {'stat1Value': 42, 'stat1Label': None, 'stat2Value': ['x'], 'stat2Label': 1.5})
    assert result['stats'] == [{'value': '42', 'label': ''}, {'value': '', 'label': '1.5'}]


# faq / logos / links: the blocks hide empty ones, so they are dropped

def test_faq_drops_items_without_question_and_keeps_those_with():
    result = convert('faq', {
        'q1': 'Q1', 'a1': 'A1',
        'q2': '', 'a2': 'Answer of a hidden question',
        'q3': 'Q3', 'a3': '',
    })
    assert result['questions'] == [{'question': 'Q1', 'answer': 'A1'}, {'question': 'Q3', 'answer': ''}]


def test_faq_with_all_questions_empty_becomes_an_empty_list():
    assert convert('faq', {'q1': '', 'a1': 'x', 'q2': None}) == {'questions': []}


def test_logos_drop_empty_names_and_keep_the_order():
    result = convert('logoCloud', {'logo1': 'A', 'logo2': '', 'logo3': 'C', 'logo4': '', 'logo5': 'E'})
    assert result['logos'] == [{'name': 'A'}, {'name': 'C'}, {'name': 'E'}]


@pytest.mark.parametrize(('block_type', 'label_key', 'url_key'), [
    ('navbar', 'link{n}', 'link{n}Url'),
    ('footer', 'link{n}Label', 'link{n}Url'),
])
def test_links_drop_items_without_label(block_type, label_key, url_key):
    data = {
        label_key.format(n=1): 'One', url_key.format(n=1): '/one',
        label_key.format(n=2): '', url_key.format(n=2): '/hidden',
        label_key.format(n=3): 'Three', url_key.format(n=3): '',
    }
    assert convert(block_type, data)['links'] == [
        {'label': 'One', 'url': '/one'},
        {'label': 'Three', 'url': ''},
    ]


def test_navbar_keeps_its_other_link_fields():
    result = convert('navbar', {'link1': 'Docs', 'link1Url': '/d', 'ctaLink': '/go', 'ctaText': 'Go'})
    assert result == {'links': [{'label': 'Docs', 'url': '/d'}], 'ctaLink': '/go', 'ctaText': 'Go'}


# lists where empty items are shown: kept

@pytest.mark.parametrize(('block_type', 'key', 'old', 'expected_item'), [
    ('features', 'features', {'feature1Title': '', 'feature1Desc': ''}, {'title': '', 'description': ''}),
    ('testimonials', 'testimonials', {'quote1': '', 'author1': '', 'role1': ''},
     {'quote': '', 'author': '', 'role': ''}),
    ('team', 'members', {'member1Name': '', 'member1Role': '', 'member1Image': ''},
     {'name': '', 'role': '', 'image': ''}),
    ('stats', 'stats', {'stat1Value': '', 'stat1Label': ''}, {'value': '', 'label': ''}),
    ('timeline', 'events', {'item1Date': '', 'item1Title': '', 'item1Desc': ''},
     {'date': '', 'title': '', 'description': ''}),
])
def test_empty_items_of_other_lists_are_kept(block_type, key, old, expected_item):
    assert convert(block_type, old) == {key: [expected_item]}


# gallery: columns * 2 slots

def _gallery_old(columns, filled):
    data = {f'image{n}': f'https://x/{n}.jpg' for n in range(1, filled + 1)}
    if columns is not None:
        data['columns'] = columns
    return data


@pytest.mark.parametrize(('columns', 'slots'), [
    ('2', 4), ('3', 6), ('4', 8), (None, 6), (3, 6), (4, 8), ('9', 6), ('abc', 6), ('', 6),
])
def test_gallery_gets_exactly_columns_times_two_items(columns, slots):
    result = convert('gallery', _gallery_old(columns, 6))
    assert len(result['images']) == slots


def test_gallery_with_two_columns_drops_the_images_it_never_showed():
    result = convert('gallery', _gallery_old('2', 6))
    assert [image['src'] for image in result['images']] == [f'https://x/{n}.jpg' for n in range(1, 5)]


def test_gallery_with_four_columns_adds_empty_slots_up_to_eight():
    result = convert('gallery', _gallery_old('4', 6))
    assert [image['src'] for image in result['images']][6:] == ['', '']
    assert all(image['alt'] == '' for image in result['images'])


def test_gallery_without_images_gets_empty_slots():
    assert convert('gallery', {'columns': '2'})['images'] == [{'src': '', 'alt': ''}] * 4


def test_gallery_keeps_columns_as_it_was():
    assert convert('gallery', {'columns': 4})['columns'] == 4
    assert 'columns' not in convert('gallery', {'image1': 'https://x/1.jpg'})


# --- snapshots ---------------------------------------------------------------

def test_snapshot_conversion_changes_only_block_data():
    snapshot = [
        {'id': 'a', 'type': 'faq', 'order': 0, 'data': {'q1': 'Q', 'a1': 'A'}, 'styles': {'paddingTop': '4'}},
        {'id': 'b', 'type': 'hero', 'order': 1, 'data': {'title': 'T'}, 'styles': {}},
    ]
    result = migration._convert_snapshot(snapshot)
    assert result == [
        {'id': 'a', 'type': 'faq', 'order': 0, 'data': {'questions': [{'question': 'Q', 'answer': 'A'}]},
         'styles': {'paddingTop': '4'}},
        {'id': 'b', 'type': 'hero', 'order': 1, 'data': {'title': 'T'}, 'styles': {}},
    ]
    assert snapshot[0]['data'] == {'q1': 'Q', 'a1': 'A'}


@pytest.mark.parametrize('snapshot', [
    [], {}, None, 'x',
    [{'id': 'a', 'type': 'hero', 'data': {'title': 'T'}}],
    [{'id': 'a', 'type': 'faq', 'data': {'questions': []}}],
    # malformed entries are skipped, never a crash
    ['not a block', {'no': 'type'}, {'type': None, 'data': {}}, {'type': 'faq'}],
])
def test_snapshot_with_nothing_to_convert_returns_none(snapshot):
    assert migration._convert_snapshot(snapshot) is None


# --- on rows -----------------------------------------------------------------

def _historical_apps():
    """The models as they are at migration 0014 (what RunPython receives)."""
    executor = MigrationExecutor(connection)
    return executor.loader.project_state([('pages', '0014_block_lists_to_arrays')]).apps


OLD_FAQ = {'title': 'FAQ', 'q1': 'Q1', 'a1': 'A1', 'q2': '', 'a2': 'hidden', 'q3': 'Q3', 'a3': 'A3'}
NEW_FAQ = {'title': 'FAQ', 'questions': [{'question': 'Q1', 'answer': 'A1'}, {'question': 'Q3', 'answer': 'A3'}]}


@pytest.mark.django_db
class TestMigrationOnRows:
    def test_blocks_and_every_version_are_converted(self):
        page = PageFactory(status='published')
        faq = BlockFactory(page=page, type='faq', order=0, data=OLD_FAQ)
        hero = BlockFactory(page=page, type='hero', order=1, data={'title': 'Hello'})
        stats = BlockFactory(page=page, type='stats', order=2, data={'stat1Value': '1', 'stat1Label': 'one'})
        done = BlockFactory(page=page, type='logoCloud', order=3, data={'logos': [{'name': 'A'}]})
        custom = BlockFactory(page=page, type='customHtml', order=4, data={'html': '<p>q1</p>'})
        unknown = BlockFactory(page=page, type='somethingElse', order=5, data={'q1': 'x'})

        def snapshot_of(blocks):
            return [
                {'id': str(b.id), 'type': b.type, 'order': b.order, 'data': copy.deepcopy(b.data), 'styles': {}}
                for b in blocks
            ]

        blocks = [faq, hero, stats, done, custom, unknown]
        draft_version = PageVersionFactory(page=page, version_number=1, snapshot=snapshot_of(blocks))
        published_version = PageVersionFactory(
            page=page, version_number=2, snapshot=snapshot_of(blocks), trigger=PageVersion.Trigger.AUTO_PUBLISH,
        )
        page.published_version = published_version
        page.save(update_fields=['published_version'])
        empty_version = PageVersionFactory(page=page, version_number=3, snapshot=[])

        updated_at = {b.id: b.updated_at for b in blocks}
        page.refresh_from_db()
        page_updated_at = page.updated_at

        migration.blocks_to_arrays(_historical_apps(), None)

        for block in blocks:
            block.refresh_from_db()
        assert faq.data == NEW_FAQ
        assert hero.data == {'title': 'Hello'}
        assert stats.data == {'stats': [{'value': '1', 'label': 'one'}]}
        assert done.data == {'logos': [{'name': 'A'}]}
        assert custom.data == {'html': '<p>q1</p>'}
        assert unknown.data == {'q1': 'x'}
        # No save(): the editor does not see these pages as edited after publishing
        assert {b.id: b.updated_at for b in blocks} == updated_at
        page.refresh_from_db()
        assert page.updated_at == page_updated_at

        for version in (draft_version, published_version):
            version.refresh_from_db()
            by_type = {block['type']: block['data'] for block in version.snapshot}
            assert by_type['faq'] == NEW_FAQ
            assert by_type['stats'] == {'stats': [{'value': '1', 'label': 'one'}]}
            assert by_type['hero'] == {'title': 'Hello'}
            assert by_type['somethingElse'] == {'q1': 'x'}
            assert [block['id'] for block in version.snapshot] == [str(b.id) for b in blocks]
            assert version.size_bytes > 0
        empty_version.refresh_from_db()
        assert empty_version.snapshot == []

        page.refresh_from_db()
        assert page.published_version_id == published_version.id

    def test_running_twice_changes_nothing_more(self):
        page = PageFactory()
        block = BlockFactory(page=page, type='faq', data=OLD_FAQ)
        version = PageVersionFactory(
            page=page, snapshot=[{'id': str(block.id), 'type': 'faq', 'order': 0, 'data': OLD_FAQ, 'styles': {}}],
        )

        migration.blocks_to_arrays(_historical_apps(), None)
        block.refresh_from_db()
        version.refresh_from_db()
        first = (copy.deepcopy(block.data), copy.deepcopy(version.snapshot), version.size_bytes)

        migration.blocks_to_arrays(_historical_apps(), None)
        block.refresh_from_db()
        version.refresh_from_db()
        assert (block.data, version.snapshot, version.size_bytes) == first

    def test_converted_data_passes_the_validators(self):
        from pages.block_validators import clean_block_data

        for block_type, old, new in (param.values for param in FULL_CASES):
            data = convert(block_type, old)
            assert clean_block_data(block_type, data) == data

    def test_reverse_is_a_noop(self):
        operation = migration.Migration.operations[0]
        assert operation.reverse_code is migration.migrations.RunPython.noop

    def test_depends_on_the_previous_migration(self):
        assert ('pages', '0013_freeze_published_pages') in migration.Migration.dependencies

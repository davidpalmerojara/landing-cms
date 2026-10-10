"""Lists of repeated items (features, plans, links...) are arrays of objects."""
import pytest
from rest_framework import serializers

from pages.block_validators import clean_block_data
from pages.serializers import BlockSerializer, PageDetailSerializer
from tests.factories import UserFactory


# block type -> (list key, max items, item as the editor sends it)
LIST_BLOCKS = {
    'features': ('features', 6, {'title': 'Fast', 'description': 'Very fast'}),
    'testimonials': ('testimonials', 6, {'quote': 'Great', 'author': 'Jane', 'role': 'CEO'}),
    'pricing': ('plans', 4, {
        'name': 'Pro', 'price': '$9', 'features': 'A\nB', 'buttonText': 'Go', 'buttonLink': '/signup',
        'highlighted': True,
    }),
    'faq': ('questions', 12, {'question': 'Why?', 'answer': 'Because'}),
    'logoCloud': ('logos', 12, {'name': 'Acme'}),
    'gallery': ('images', 12, {'src': 'https://example.com/a.jpg', 'alt': 'A cat'}),
    'team': ('members', 8, {'name': 'Ana', 'role': 'CTO', 'image': 'https://example.com/ana.jpg'}),
    'stats': ('stats', 6, {'value': '10K', 'label': 'Users'}),
    'timeline': ('events', 10, {'date': '2025', 'title': 'Launch', 'description': 'We shipped'}),
    'navbar': ('links', 6, {'label': 'Docs', 'url': '/docs'}),
    'footer': ('links', 6, {'label': 'Terms', 'url': '/terms'}),
}

CASES = [(block_type, *spec) for block_type, spec in LIST_BLOCKS.items()]


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_list_is_stored_as_sent(block_type, key, max_items, item):
    assert clean_block_data(block_type, {key: [item, item]}) == {key: [item, item]}


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_empty_list_is_valid(block_type, key, max_items, item):
    assert clean_block_data(block_type, {key: []}) == {key: []}


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_max_items_is_enforced(block_type, key, max_items, item):
    assert len(clean_block_data(block_type, {key: [item] * max_items})[key]) == max_items

    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, {key: [item] * (max_items + 1)})
    assert key in exc_info.value.detail


@pytest.mark.parametrize('value', ['text', {'title': 'x'}, 5, True, None])
@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_non_list_value_is_rejected(block_type, key, max_items, item, value):
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, {key: value})
    assert key in exc_info.value.detail


@pytest.mark.parametrize('bad_item', ['text', 5, None, ['a'], True])
@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_items_must_be_objects(block_type, key, max_items, item, bad_item):
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, {key: [item, bad_item]})
    assert f'{key}[1]' in exc_info.value.detail


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_unknown_item_keys_are_dropped(block_type, key, max_items, item):
    dirty = {**item, 'onclick': 'alert(1)', 'href': 'javascript:alert(1)', 'extra': {'a': 1}}
    assert clean_block_data(block_type, {key: [dirty]}) == {key: [item]}


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_missing_and_null_item_fields_get_their_defaults(block_type, key, max_items, item):
    defaults = {name: False if isinstance(value, bool) else '' for name, value in item.items()}
    assert clean_block_data(block_type, {key: [{}]}) == {key: [defaults]}
    assert clean_block_data(block_type, {key: [{name: None for name in item}]}) == {key: [defaults]}


@pytest.mark.parametrize(('block_type', 'key', 'max_items', 'item'), CASES)
def test_item_order_is_kept(block_type, key, max_items, item):
    first_field = next(iter(item))
    # A leading slash keeps the value valid where the field is an image URL
    items = [{**item, first_field: f'/item-{n}'} for n in range(3)]
    result = clean_block_data(block_type, {key: items})[key]
    assert [entry[first_field] for entry in result] == ['/item-0', '/item-1', '/item-2']


def test_numbered_keys_are_not_part_of_the_schema_anymore():
    # Allowlist: the old shape is dropped, never stored next to the arrays
    data = {'title': 'Hi', 'feature1Title': 'Old', 'feature1Desc': 'Old', 'features': []}
    assert clean_block_data('features', data) == {'title': 'Hi', 'features': []}
    assert clean_block_data('faq', {'q1': 'Old?', 'a1': 'Old'}) == {}
    assert clean_block_data('navbar', {'link1': 'Old', 'link1Url': '/old'}) == {}


def test_boolean_item_field_rejects_other_types():
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data('pricing', {'plans': [{'name': 'Pro', 'highlighted': 'yes'}]})
    assert 'plans[0].highlighted' in exc_info.value.detail


def test_text_item_field_rejects_non_strings():
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data('stats', {'stats': [{'value': 5, 'label': ['x']}]})
    assert set(exc_info.value.detail) == {'stats[0].value', 'stats[0].label'}


def test_errors_of_several_items_are_reported_together():
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data('navbar', {'links': [
            {'label': 'ok', 'url': '/ok'},
            {'label': 'x' * 201, 'url': 'javascript:alert(1)'},
            'nope',
        ]})
    assert set(exc_info.value.detail) == {'links[1].label', 'links[1].url', 'links[2]'}


class TestListItemSanitizing:
    @pytest.mark.parametrize('block_type', ['navbar', 'footer'])
    def test_javascript_link_in_links_is_rejected(self, block_type):
        with pytest.raises(serializers.ValidationError) as exc_info:
            clean_block_data(block_type, {'links': [{'label': 'Go', 'url': 'javascript:alert(1)'}]})
        assert 'links[0].url' in exc_info.value.detail

    def test_javascript_plan_button_link_is_rejected(self):
        with pytest.raises(serializers.ValidationError) as exc_info:
            clean_block_data('pricing', {'plans': [{'name': 'Pro', 'buttonLink': 'javascript:alert(1)'}]})
        assert 'plans[0].buttonLink' in exc_info.value.detail

    def test_unsafe_image_url_in_members_is_rejected(self):
        with pytest.raises(serializers.ValidationError) as exc_info:
            clean_block_data('team', {'members': [{'name': 'Ana', 'image': 'javascript:alert(1)'}]})
        assert 'members[0].image' in exc_info.value.detail

    def test_unsafe_image_url_in_gallery_is_rejected(self):
        with pytest.raises(serializers.ValidationError) as exc_info:
            clean_block_data('gallery', {'images': [{'src': 'data:image/svg+xml;base64,AAAA'}]})
        assert 'images[0].src' in exc_info.value.detail

    def test_script_in_feature_description_is_sanitized(self):
        data = clean_block_data('features', {'features': [
            {'title': 'T', 'description': '<script>alert(1)</script><strong>Bold</strong><img src=x onerror=alert(1)>'},
        ]})
        description = data['features'][0]['description']
        assert '<script' not in description
        assert 'onerror' not in description
        assert '<img' not in description
        # Plain text: the tags go, what was between them stays as text
        assert description == 'alert(1)Bold'

    @pytest.mark.parametrize(('block_type', 'key', 'field'), [
        ('testimonials', 'testimonials', 'quote'),
        ('faq', 'questions', 'answer'),
        ('pricing', 'plans', 'features'),
        ('timeline', 'events', 'description'),
    ])
    def test_long_text_item_fields_are_plain_text(self, block_type, key, field):
        data = clean_block_data(block_type, {key: [
            {field: '<b onclick="x()">a</b> <em>b</em> <iframe src="//evil"></iframe>'},
        ]})
        value = data[key][0][field]
        # QA-001 / ADR-029: no field takes formatting, so none is stored
        assert value == 'a b '
        assert '<' not in value

    @pytest.mark.parametrize(('block_type', 'key', 'field'), [
        ('features', 'features', 'title'),
        ('testimonials', 'testimonials', 'author'),
        ('faq', 'questions', 'question'),
        ('logoCloud', 'logos', 'name'),
        ('stats', 'stats', 'value'),
        ('navbar', 'links', 'label'),
    ])
    def test_plain_text_item_fields_have_all_html_removed(self, block_type, key, field):
        data = clean_block_data(block_type, {key: [{field: '<b>bold</b><script>alert(1)</script>'}]})
        assert data[key][0][field] == 'boldalert(1)'

    def test_plain_text_is_stored_as_text_and_typed_entities_are_kept(self):
        # Stored as text, not as entities; an entity the user typed is not decoded
        data = clean_block_data('stats', {'stats': [{'value': '5 &lt; 6', 'label': '<10ms'}]})
        assert data['stats'][0] == {'value': '5 &lt; 6', 'label': '<10ms'}
        data = clean_block_data('stats', {'stats': [{'value': '&amp;lt;'}]})
        assert data['stats'][0]['value'] == '&amp;lt;'

    def test_alt_text_is_plain_text_with_a_300_char_limit(self):
        data = clean_block_data('gallery', {'images': [{'src': '', 'alt': '<b>A</b> cat'}]})
        assert data['images'][0]['alt'] == 'A cat'
        assert clean_block_data('gallery', {'images': [{'alt': 'x' * 300}]})['images'][0]['alt'] == 'x' * 300
        with pytest.raises(serializers.ValidationError):
            clean_block_data('gallery', {'images': [{'alt': 'x' * 301}]})

    def test_whole_block_size_limit_still_applies(self):
        big = [{'title': 'x' * 200, 'description': 'y' * 500}] * 6
        assert len(clean_block_data('features', {'features': big})['features']) == 6
        with pytest.raises(serializers.ValidationError):
            clean_block_data('features', {'title': 'x', 'features': [{'title': 'a' * 70_000}]})


@pytest.mark.django_db
class TestListsThroughTheApiSerializers:
    def test_block_serializer_reports_nested_errors_under_data(self):
        serializer = BlockSerializer(data={
            'type': 'navbar',
            'order': 0,
            'data': {'links': [{'label': 'Go', 'url': 'javascript:alert(1)'}]},
            'styles': {},
        })
        assert not serializer.is_valid()
        assert 'links[0].url' in serializer.errors['data']

    def test_block_serializer_rejects_non_list(self):
        serializer = BlockSerializer(data={
            'type': 'faq', 'order': 0, 'data': {'questions': 'q1'}, 'styles': {},
        })
        assert not serializer.is_valid()
        assert 'questions' in serializer.errors['data']

    def test_page_save_stores_clean_arrays(self):
        serializer = PageDetailSerializer(data={
            'name': 'Lists',
            'blocks': [{
                'type': 'features',
                'data': {'features': [{'title': '<i>Fast</i>', 'description': 'ok', 'junk': 1}]},
                'styles': {},
            }],
        })
        assert serializer.is_valid(), serializer.errors
        page = serializer.save(owner=UserFactory())
        assert page.blocks.get().data == {'features': [{'title': 'Fast', 'description': 'ok'}]}

    def test_update_replaces_the_whole_list(self):
        owner = UserFactory()
        create = PageDetailSerializer(data={
            'name': 'Lists',
            'blocks': [{
                'type': 'faq',
                'data': {'questions': [{'question': 'A?', 'answer': 'a'}, {'question': 'B?', 'answer': 'b'}]},
                'styles': {},
            }],
        })
        assert create.is_valid(), create.errors
        page = create.save(owner=owner)
        block = page.blocks.get()

        update = PageDetailSerializer(instance=page, data={
            'name': 'Lists',
            'blocks': [{
                'id': str(block.id),
                'type': 'faq',
                'order': 0,
                'data': {'questions': [{'question': 'C?', 'answer': 'c'}]},
                'styles': {},
            }],
        })
        assert update.is_valid(), update.errors
        update.save()
        block.refresh_from_db()
        assert block.data['questions'] == [{'question': 'C?', 'answer': 'c'}]

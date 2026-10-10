import pytest

from pages.serializers import BlockSerializer, PageDetailSerializer
from tests.factories import UserFactory, PageFactory, BlockFactory


VALID_BLOCK_CASES = [
    ('navbar', {'brandName': 'Acme', 'ctaText': 'Start', 'logoImage': 'https://example.com/logo.png', 'links': [{'label': 'Docs', 'url': '/docs'}]}),
    ('hero', {'title': 'Hero title', 'alignment': 'right', 'backgroundImage': 'https://example.com/bg.jpg'}),
    ('features', {'title': None, 'features': [{'title': 'Fast', 'description': 'Desc'}]}),
    ('testimonials', {'testimonials': [{'quote': 'Loved it', 'author': 'Jane', 'role': 'CEO'}]}),
    ('cta', {'title': 'Join now', 'buttonText': 'Go'}),
    ('footer', {'brandName': 'Acme', 'description': 'Footer copy', 'links': [{'label': 'Terms', 'url': ''}]}),
    ('pricing', {'title': 'Plans', 'plans': [{'name': 'Pro', 'highlighted': True}], 'billingPeriod': '/mo'}),
    ('faq', {'questions': [{'question': 'How?', 'answer': 'Like this'}]}),
    ('logoCloud', {'logos': [{'name': 'Acme'}]}),
    ('gallery', {'columns': 4, 'images': [{'src': 'https://example.com/1.jpg', 'alt': 'One'}]}),
    ('contact', {'title': 'Contact', 'emailPlaceholder': 'Email'}),
    ('customHtml', {'html': '<section><h2>Hello</h2></section>'}),
    ('team', {'members': [{'name': 'Ana', 'role': 'CEO', 'image': 'https://example.com/a.jpg'}]}),
    ('stats', {'stats': [{'value': '10K', 'label': 'Users'}]}),
    ('timeline', {'events': [{'date': '2025', 'title': 'Launch', 'description': ''}]}),
]

MAX_LENGTH_CASES = [
    ('navbar', 'brandName', 'x' * 101),
    ('hero', 'title', 'x' * 201),
    ('features', ('features', 'description'), 'x' * 501),
    ('testimonials', ('testimonials', 'quote'), 'x' * 501),
    ('cta', 'buttonText', 'x' * 51),
    ('footer', 'copyright', 'x' * 201),
    ('pricing', 'billingPeriod', 'x' * 201),
    ('faq', ('questions', 'answer'), 'x' * 1001),
    ('logoCloud', ('logos', 'name'), 'x' * 101),
    ('gallery', 'title', 'x' * 201),
    ('contact', 'namePlaceholder', 'x' * 101),
    ('customHtml', 'html', 'x' * 50001),
    ('team', ('members', 'name'), 'x' * 101),
    ('stats', ('stats', 'label'), 'x' * 201),
    ('timeline', ('events', 'description'), 'x' * 501),
    ('gallery', ('images', 'alt'), 'x' * 301),
    ('pricing', ('plans', 'features'), 'x' * 1001),
    ('navbar', ('links', 'label'), 'x' * 201),
    ('footer', ('links', 'label'), 'x' * 201),
]


@pytest.mark.parametrize(('block_type', 'data'), VALID_BLOCK_CASES)
def test_each_block_type_accepts_valid_data(block_type, data):
    serializer = BlockSerializer(data={
        'type': block_type,
        'order': 0,
        'data': data,
        'styles': {},
    })
    assert serializer.is_valid(), serializer.errors


@pytest.mark.parametrize(('block_type', 'field_name', 'value'), MAX_LENGTH_CASES)
def test_each_block_type_rejects_exceeded_max_length(block_type, field_name, value):
    if isinstance(field_name, tuple):
        list_key, item_field = field_name
        data = {list_key: [{item_field: value}]}
        expected_error = f'{list_key}[0].{item_field}'
    else:
        data = {field_name: value}
        expected_error = field_name
    serializer = BlockSerializer(data={
        'type': block_type,
        'order': 0,
        'data': data,
        'styles': {},
    })
    assert not serializer.is_valid()
    assert expected_error in serializer.errors['data']


@pytest.mark.parametrize(
    ('block_type', 'data', 'field_name'),
    [
        ('hero', {'alignment': 'diagonal'}, 'alignment'),
        ('gallery', {'columns': '9'}, 'columns'),
    ],
)
def test_enum_fields_reject_invalid_values(block_type, data, field_name):
    serializer = BlockSerializer(data={
        'type': block_type,
        'order': 0,
        'data': data,
        'styles': {},
    })
    assert not serializer.is_valid()
    assert field_name in serializer.errors['data']


@pytest.mark.parametrize(
    ('block_type', 'data', 'field_name'),
    [
        ('hero', {'backgroundImage': 'javascript:alert(1)'}, 'backgroundImage'),
        ('gallery', {'images': [{'src': 'javascript:alert(1)'}]}, 'images[0].src'),
        ('navbar', {'logoImage': 'javascript:alert(1)'}, 'logoImage'),
        ('team', {'members': [{'name': 'Ana', 'image': 'javascript:alert(1)'}]}, 'members[0].image'),
    ],
)
def test_url_fields_reject_unsafe_schemes(block_type, data, field_name):
    serializer = BlockSerializer(data={
        'type': block_type,
        'order': 0,
        'data': data,
        'styles': {},
    })
    assert not serializer.is_valid()
    assert field_name in serializer.errors['data']


@pytest.mark.django_db
def test_page_serializer_allows_optional_features_title():
    serializer = PageDetailSerializer(data={
        'name': 'Features page',
        'blocks': [
            {'type': 'features', 'data': {'title': None, 'features': [{'title': 'Fast'}]}, 'styles': {}},
        ],
    })
    assert serializer.is_valid(), serializer.errors


@pytest.mark.django_db
def test_page_serializer_rejects_invalid_hero_alignment():
    serializer = PageDetailSerializer(data={
        'name': 'Invalid hero',
        'blocks': [
            {'type': 'hero', 'data': {'title': 'Hello', 'alignment': 'diagonal'}, 'styles': {}},
        ],
    })
    assert not serializer.is_valid()
    assert 'alignment' in serializer.errors['blocks'][0]['data']


@pytest.mark.django_db
def test_page_serializer_rejects_overlong_hero_title():
    serializer = PageDetailSerializer(data={
        'name': 'Invalid hero',
        'blocks': [
            {'type': 'hero', 'data': {'title': 'x' * 5000}, 'styles': {}},
        ],
    })
    assert not serializer.is_valid()
    assert 'title' in serializer.errors['blocks'][0]['data']


@pytest.mark.django_db
def test_page_serializer_accepts_valid_hero_payload():
    user = UserFactory()
    serializer = PageDetailSerializer(data={
        'name': 'Valid hero',
        'blocks': [
            {
                'type': 'hero',
                'data': {
                    'title': 'Hello',
                    'alignment': 'center',
                    'backgroundImage': 'https://example.com/bg.jpg',
                },
                'styles': {},
            },
        ],
    })
    assert serializer.is_valid(), serializer.errors
    page = serializer.save(owner=user)
    assert page.blocks.count() == 1


@pytest.mark.django_db
def test_update_existing_block_replaces_its_data():
    user = UserFactory()
    page = PageFactory(owner=user)
    block = BlockFactory(
        page=page,
        type='hero',
        data={'title': 'Old', 'subtitle': 'Keep me', 'alignment': 'left'},
    )

    serializer = PageDetailSerializer(instance=page, data={
        'name': page.name,
        'blocks': [
            {
                'id': str(block.id),
                'type': 'hero',
                'order': 0,
                'data': {'title': 'New'},
                'styles': {},
            },
        ],
    })
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    updated_block = updated.blocks.get(id=block.id)
    # Replaced, not merged: a key the editor removed is really gone (ADR-024)
    assert updated_block.data == {'title': 'New'}


@pytest.mark.django_db
class TestBlockAllowlist:
    def _save(self, blocks):
        serializer = PageDetailSerializer(data={'name': 'Allowlist', 'blocks': blocks})
        return serializer

    def test_rejects_unknown_block_types(self):
        serializer = self._save([{'type': 'script', 'data': {}, 'styles': {}}])
        assert not serializer.is_valid()
        assert 'type' in serializer.errors['blocks'][0]

    def test_drops_fields_without_a_rule(self):
        serializer = self._save([{
            'type': 'hero',
            'data': {'title': 'Hola', 'href': 'javascript:alert(1)', 'onload': 'x'},
            'styles': {},
        }])
        assert serializer.is_valid(), serializer.errors
        page = serializer.save(owner=UserFactory())
        assert page.blocks.get().data == {'title': 'Hola'}

    def test_keeps_null_and_boolean_values_that_have_rules(self):
        serializer = self._save([{
            'type': 'pricing',
            'data': {'title': None, 'plans': [{'name': 'Pro', 'highlighted': True}]},
            'styles': {},
        }])
        assert serializer.is_valid(), serializer.errors
        page = serializer.save(owner=UserFactory())
        assert page.blocks.get().data == {
            'title': None,
            'plans': [{
                'name': 'Pro', 'price': '', 'features': '', 'buttonText': '', 'buttonLink': '', 'highlighted': True,
            }],
        }

    def test_rejects_oversized_block_data(self):
        serializer = self._save([{'type': 'customHtml', 'data': {'html': 'x' * 70_000}, 'styles': {}}])
        assert not serializer.is_valid()


@pytest.mark.django_db
class TestBlockStylesOverRest:
    """SEC2-007: the REST API stored any JSON as a block's styles; the WebSocket cleaned them."""

    def _put(self, client, page, styles):
        return client.put(f'/api/pages/{page.id}/', {
            'name': page.name, 'version': page.version,
            'blocks': [{'type': 'hero', 'order': 0, 'data': {'title': 'T'}, 'styles': styles}],
        }, format='json')

    @pytest.mark.parametrize('styles', ['x', ['a'], 7, {'bgColor': 'x' * 9_000}])
    def test_styles_that_are_not_a_small_object_are_refused(self, auth_client, page, styles):
        response = self._put(auth_client, page, styles)

        assert response.status_code == 400
        assert 'styles' in str(response.data['details'])
        assert not page.blocks.exists()

    def test_nested_values_past_the_device_overrides_are_dropped(self, auth_client, page):
        response = self._put(auth_client, page, {
            'paddingTop': 16, 'bgColor': '#fff', 'list': [1, 2],
            'responsive': {'mobile': {'paddingTop': 8, 'deep': {'deeper': {'x': 1}}}},
        })

        assert response.status_code == 200, response.data
        assert page.blocks.get().styles == {
            'paddingTop': 16, 'bgColor': '#fff', 'responsive': {'mobile': {'paddingTop': 8}},
        }

    def test_the_styles_the_editor_sends_are_kept(self, auth_client, page):
        styles = {'paddingTop': 32, 'bgColor': '', 'responsive': {'tablet': {'paddingTop': 24}, 'mobile': {}}}

        assert self._put(auth_client, page, styles).status_code == 200
        assert page.blocks.get().styles == styles

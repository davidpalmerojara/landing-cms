import pytest
from rest_framework import serializers

from pages.block_validators import clean_block_data
from pages.serializers import BlockSerializer, PageDetailSerializer
from tests.factories import UserFactory


# (block type, field). A field inside the items of a list is (list key, item field).
LINK_FIELDS = [
    ('hero', 'buttonLink'),
    ('hero', 'secondaryButtonLink'),
    ('cta', 'buttonLink'),
    ('navbar', 'ctaLink'),
    ('navbar', ('links', 'url')),
    ('footer', ('links', 'url')),
    ('pricing', ('plans', 'buttonLink')),
]

IMAGE_FIELDS = [
    ('hero', 'backgroundImage'),
    ('navbar', 'logoImage'),
    ('gallery', ('images', 'src')),
    ('team', ('members', 'image')),
]


def payload(field, value):
    """The data of a block with `value` in `field`."""
    if isinstance(field, tuple):
        list_key, item_field = field
        return {list_key: [{item_field: value}]}
    return {field: value}


def error_key(field):
    if isinstance(field, tuple):
        return f'{field[0]}[0].{field[1]}'
    return field


def stored(block_type, field, value):
    """What clean_block_data stores in `field` after validating `value`."""
    data = clean_block_data(block_type, payload(field, value))
    if isinstance(field, tuple):
        return data[field[0]][0][field[1]]
    return data[field]

ACCEPTED_LINKS = [
    '',
    'https://example.com',
    'https://example.com/path?x=1&y=2#frag',
    'http://example.com',
    'HTTPS://EXAMPLE.COM/Path',
    'mailto:hola@example.com',
    'mailto:hola@example.com?subject=Hola%20mundo',
    'tel:+34600123456',
    '/',
    '/precios',
    '/p/mi-pagina?ref=nav',
    '#',
    '#features',
    '#section-2',
]

REJECTED_LINKS = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'javascript:alert(1) ',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'java\x00script:alert(1)',
    '\x01javascript:alert(1)',
    ' javascript:alert(1)',
    'jav&#x09;ascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    '//evil.com',
    '//evil.com/path',
    '/\\evil.com',
    '\\\\evil.com',
    '/ /evil.com',
    '/\t/evil.com',
    ' https://example.com',
    'https://example.com ',
    'https://exa mple.com',
    'https://',
    'mailto:',
    'tel:',
    'example.com',
    'www.example.com',
    'pricing',
    '?x=1',
    'https:example.com',
]


@pytest.mark.parametrize(('block_type', 'field'), LINK_FIELDS)
@pytest.mark.parametrize('value', ACCEPTED_LINKS)
def test_link_fields_accept_safe_links(block_type, field, value):
    assert stored(block_type, field, value) == value


@pytest.mark.parametrize(('block_type', 'field'), LINK_FIELDS)
@pytest.mark.parametrize('value', REJECTED_LINKS)
def test_link_fields_reject_unsafe_links(block_type, field, value):
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, payload(field, value))
    assert error_key(field) in exc_info.value.detail


@pytest.mark.parametrize(('block_type', 'field'), LINK_FIELDS)
def test_link_fields_enforce_max_length(block_type, field):
    long_link = 'https://example.com/' + 'a' * 1980
    assert len(long_link) == 2000
    assert stored(block_type, field, long_link) == long_link

    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, payload(field, long_link + 'a'))
    assert error_key(field) in exc_info.value.detail


@pytest.mark.parametrize(('block_type', 'field'), LINK_FIELDS)
def test_link_fields_reject_non_strings(block_type, field):
    with pytest.raises(serializers.ValidationError):
        clean_block_data(block_type, payload(field, 123))
    with pytest.raises(serializers.ValidationError):
        clean_block_data(block_type, payload(field, ['https://example.com']))


@pytest.mark.parametrize(('block_type', 'field'), LINK_FIELDS)
def test_link_fields_allow_null(block_type, field):
    if isinstance(field, tuple):
        # A null inside a list item is an empty field: the item keeps all its keys
        assert stored(block_type, field, None) == ''
    else:
        assert clean_block_data(block_type, {field: None}) == {field: None}


def test_link_value_is_stored_verbatim():
    url = 'https://example.com/search?q=a&b=c'
    assert clean_block_data('cta', {'buttonLink': url}) == {'buttonLink': url}


def test_link_fields_are_dropped_on_other_block_types():
    # Allowlist: a link field without a rule is dropped, never stored
    assert clean_block_data('features', {'title': 'Hola', 'buttonLink': 'https://example.com'}) == {'title': 'Hola'}
    assert clean_block_data('contact', {'buttonLink': 'https://example.com'}) == {}


@pytest.mark.parametrize(('block_type', 'field'), IMAGE_FIELDS)
@pytest.mark.parametrize('value', ['mailto:a@b.com', 'tel:+34600123456', 'javascript:alert(1)', 'data:image/png;base64,AAAA'])
def test_image_fields_still_reject_non_http_schemes(block_type, field, value):
    with pytest.raises(serializers.ValidationError) as exc_info:
        clean_block_data(block_type, payload(field, value))
    assert error_key(field) in exc_info.value.detail


@pytest.mark.parametrize(('block_type', 'field'), IMAGE_FIELDS)
def test_image_fields_accept_http_urls_and_site_paths(block_type, field):
    assert stored(block_type, field, 'https://example.com/a.jpg') == 'https://example.com/a.jpg'
    assert stored(block_type, field, '/media/assets/a.jpg') == '/media/assets/a.jpg'


def test_image_fields_still_accept_http_urls():
    assert clean_block_data('hero', {'backgroundImage': 'https://example.com/a.jpg'}) == {
        'backgroundImage': 'https://example.com/a.jpg',
    }


def test_block_serializer_reports_link_error_under_data():
    serializer = BlockSerializer(data={
        'type': 'hero',
        'order': 0,
        'data': {'title': 'Hola', 'buttonLink': 'javascript:alert(1)'},
        'styles': {},
    })
    assert not serializer.is_valid()
    assert 'buttonLink' in serializer.errors['data']


@pytest.mark.django_db
def test_page_serializer_saves_links():
    serializer = PageDetailSerializer(data={
        'name': 'Links',
        'blocks': [
            {
                'type': 'navbar',
                'data': {
                    'brandName': 'Acme',
                    'links': [{'label': 'Precios', 'url': '#pricing'}],
                    'ctaLink': 'https://example.com/signup',
                },
                'styles': {},
            },
            {
                'type': 'hero',
                'data': {'title': 'Hola', 'buttonLink': '/registro', 'secondaryButtonLink': 'mailto:hola@example.com'},
                'styles': {},
            },
        ],
    })
    assert serializer.is_valid(), serializer.errors
    page = serializer.save(owner=UserFactory())
    navbar, hero = page.blocks.order_by('order')
    assert navbar.data['links'] == [{'label': 'Precios', 'url': '#pricing'}]
    assert navbar.data['ctaLink'] == 'https://example.com/signup'
    assert hero.data['buttonLink'] == '/registro'
    assert hero.data['secondaryButtonLink'] == 'mailto:hola@example.com'


@pytest.mark.django_db
def test_page_serializer_rejects_unsafe_link():
    serializer = PageDetailSerializer(data={
        'name': 'Links',
        'blocks': [
            {'type': 'cta', 'data': {'title': 'Hola', 'buttonLink': 'java\tscript:alert(1)'}, 'styles': {}},
        ],
    })
    assert not serializer.is_valid()
    assert 'buttonLink' in serializer.errors['blocks'][0]['data']

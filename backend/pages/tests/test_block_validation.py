import pytest

from pages.serializers import BlockSerializer, PageDetailSerializer
from tests.factories import UserFactory, PageFactory, BlockFactory


VALID_BLOCK_CASES = [
    ('navbar', {'brandName': 'Acme', 'ctaText': 'Start', 'logoImage': 'https://example.com/logo.png'}),
    ('hero', {'title': 'Hero title', 'alignment': 'right', 'backgroundImage': 'https://example.com/bg.jpg'}),
    ('features', {'title': None, 'feature1Title': 'Fast', 'feature1Desc': 'Desc'}),
    ('testimonials', {'quote1': 'Loved it', 'author1': 'Jane'}),
    ('cta', {'title': 'Join now', 'buttonText': 'Go'}),
    ('footer', {'brandName': 'Acme', 'description': 'Footer copy'}),
    ('pricing', {'title': 'Plans', 'plan2Highlighted': True, 'billingPeriod': '/mo'}),
    ('faq', {'q1': 'How?', 'a1': 'Like this'}),
    ('logoCloud', {'logo1': 'Acme'}),
    ('gallery', {'columns': 4, 'image1': 'https://example.com/1.jpg'}),
    ('contact', {'title': 'Contact', 'emailPlaceholder': 'Email'}),
    ('customHtml', {'html': '<section><h2>Hello</h2></section>'}),
    ('team', {'member1Name': 'Ana', 'member1Image': 'https://example.com/a.jpg'}),
    ('stats', {'stat1Value': '10K', 'stat1Label': 'Users'}),
    ('timeline', {'item1Date': '2025', 'item1Title': 'Launch'}),
]

MAX_LENGTH_CASES = [
    ('navbar', 'brandName', 'x' * 101),
    ('hero', 'title', 'x' * 201),
    ('features', 'feature1Desc', 'x' * 501),
    ('testimonials', 'quote1', 'x' * 501),
    ('cta', 'buttonText', 'x' * 51),
    ('footer', 'copyright', 'x' * 201),
    ('pricing', 'billingPeriod', 'x' * 201),
    ('faq', 'a1', 'x' * 1001),
    ('logoCloud', 'logo1', 'x' * 101),
    ('gallery', 'title', 'x' * 201),
    ('contact', 'namePlaceholder', 'x' * 101),
    ('customHtml', 'html', 'x' * 50001),
    ('team', 'member1Name', 'x' * 101),
    ('stats', 'stat1Label', 'x' * 201),
    ('timeline', 'item1Desc', 'x' * 501),
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
    serializer = BlockSerializer(data={
        'type': block_type,
        'order': 0,
        'data': {field_name: value},
        'styles': {},
    })
    assert not serializer.is_valid()
    assert field_name in serializer.errors['data']


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
        ('gallery', {'image1': 'javascript:alert(1)'}, 'image1'),
        ('navbar', {'logoImage': 'javascript:alert(1)'}, 'logoImage'),
        ('team', {'member1Image': 'javascript:alert(1)'}, 'member1Image'),
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
            {'type': 'features', 'data': {'title': None, 'feature1Title': 'Fast'}, 'styles': {}},
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
def test_update_existing_block_merges_partial_data():
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
    assert updated_block.data == {'title': 'New', 'subtitle': 'Keep me', 'alignment': 'left'}

import pytest
from rest_framework import serializers
from pages.models import Page, Block, CustomDomain
from pages.serializers import PageDetailSerializer, CustomDomainSerializer, SYSTEM_DOMAINS
from tests.factories import UserFactory, PageFactory, BlockFactory, CustomDomainFactory


@pytest.mark.django_db
class TestPageDetailSerializerCreate:
    def test_create_page_with_blocks(self):
        user = UserFactory()
        data = {
            'name': 'Test Page',
            'blocks': [
                {'type': 'hero', 'data': {'title': 'Hello'}, 'styles': {}},
                {'type': 'features', 'data': {'items': []}, 'styles': {}},
            ],
        }
        serializer = PageDetailSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        page = serializer.save(owner=user)

        assert page.name == 'Test Page'
        assert page.blocks.count() == 2
        assert page.blocks.first().type == 'hero'

    def test_block_order_assigned_from_index(self):
        user = UserFactory()
        data = {
            'name': 'Order Test',
            'blocks': [
                {'type': 'cta', 'data': {}, 'styles': {}},
                {'type': 'hero', 'data': {}, 'styles': {}},
                {'type': 'footer', 'data': {}, 'styles': {}},
            ],
        }
        serializer = PageDetailSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        page = serializer.save(owner=user)

        blocks = list(page.blocks.order_by('order'))
        assert blocks[0].order == 0
        assert blocks[1].order == 1
        assert blocks[2].order == 2


@pytest.mark.django_db
class TestPageDetailSerializerUpdate:
    def test_update_syncs_blocks(self):
        user = UserFactory()
        page = PageFactory(owner=user)
        b1 = BlockFactory(page=page, type='hero', order=0, data={'title': 'Old'})
        b2 = BlockFactory(page=page, type='features', order=1)

        # Update: modify b1, remove b2, add new block
        data = {
            'name': 'Updated Page',
            'blocks': [
                {'id': str(b1.id), 'type': 'hero', 'order': 0, 'data': {'title': 'New'}, 'styles': {}},
                {'type': 'cta', 'order': 1, 'data': {}, 'styles': {}},
            ],
        }
        serializer = PageDetailSerializer(instance=page, data=data)
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()

        assert updated.name == 'Updated Page'
        assert updated.blocks.count() == 2
        # b1 was updated
        b1.refresh_from_db()
        assert b1.data == {'title': 'New'}
        # b2 was deleted
        assert not Block.objects.filter(pk=b2.pk).exists()

    def test_update_creates_new_blocks_with_frontend_ids(self):
        """Blocks with non-UUID ids (like blk_xxx) should be created as new."""
        user = UserFactory()
        page = PageFactory(owner=user)

        data = {
            'name': page.name,
            'blocks': [
                {'id': 'blk_abc123', 'type': 'hero', 'order': 0, 'data': {}, 'styles': {}},
            ],
        }
        serializer = PageDetailSerializer(instance=page, data=data)
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()

        assert updated.blocks.count() == 1
        block = updated.blocks.first()
        assert block.type == 'hero'


@pytest.mark.django_db
class TestCustomDomainSerializerValidation:
    def test_valid_domain_passes(self):
        serializer = CustomDomainSerializer(data={'domain': 'landing.example.com'})
        # Partial validation — just check the domain field
        serializer.is_valid()
        # If domain field is valid, it won't be in errors
        assert 'domain' not in serializer.errors

    def test_system_domain_fails(self):
        serializer = CustomDomainSerializer(data={'domain': 'builderpro.com'})
        serializer.is_valid()
        assert 'domain' in serializer.errors

    def test_subdomain_of_system_fails(self):
        serializer = CustomDomainSerializer(data={'domain': 'test.builderpro.com'})
        serializer.is_valid()
        assert 'domain' in serializer.errors

    def test_invalid_format_fails(self):
        serializer = CustomDomainSerializer(data={'domain': 'not a domain!!'})
        serializer.is_valid()
        assert 'domain' in serializer.errors


@pytest.mark.django_db
class TestBlockSanitization:
    def test_plain_text_fields_strip_script_tags(self):
        serializer = PageDetailSerializer(data={
            'name': 'Unsafe Hero',
            'blocks': [
                {'type': 'hero', 'data': {'title': '<script>alert(1)</script>Hello'}, 'styles': {}},
            ],
        })
        assert serializer.is_valid(), serializer.errors

        page = serializer.save(owner=UserFactory())
        assert page.blocks.first().data['title'] == 'alert(1)Hello'

    def test_custom_html_strips_event_handlers(self):
        serializer = PageDetailSerializer(data={
            'name': 'Unsafe HTML',
            'blocks': [
                {'type': 'customHtml', 'data': {'html': '<img src="https://example.com/x.png" onerror="alert(1)">'}, 'styles': {}},
            ],
        })
        assert serializer.is_valid(), serializer.errors

        page = serializer.save(owner=UserFactory())
        html = page.blocks.first().data['html']
        assert 'onerror' not in html
        assert '<img' in html

    def test_url_fields_reject_javascript_scheme(self):
        serializer = PageDetailSerializer(data={
            'name': 'Unsafe URL',
            'blocks': [
                {'type': 'hero', 'data': {'backgroundImage': 'javascript:alert(1)'}, 'styles': {}},
            ],
        })
        assert not serializer.is_valid()
        assert serializer.errors == {
            'blocks': [{'data': {'backgroundImage': ['URL no permitida: javascript:alert(1)']}}],
        }

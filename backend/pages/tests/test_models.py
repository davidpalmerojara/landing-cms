import pytest
from datetime import timedelta
from django.utils import timezone
from pages.models import Page, Block
from accounts.models import MagicToken
from tests.factories import PageFactory, BlockFactory, MagicTokenFactory


@pytest.mark.django_db
class TestPageSlugGeneration:
    def test_auto_generates_slug_from_name(self):
        page = Page(name="My Landing Page")
        page.save()
        assert page.slug == "my-landing-page"

    def test_slug_unique_appends_number(self):
        Page.objects.create(name="Hello World")
        page2 = Page(name="Hello World")
        page2.save()
        assert page2.slug == "hello-world-1"

    def test_slug_does_not_change_on_subsequent_save(self):
        page = Page(name="Original Name")
        page.save()
        original_slug = page.slug
        page.name = "Updated Name"
        page.save()
        assert page.slug == original_slug

    def test_empty_name_generates_page_slug(self):
        page = Page(name="")
        page.save()
        assert page.slug == "page"


@pytest.mark.django_db
class TestMagicTokenExpiry:
    def test_fresh_token_not_expired(self):
        token = MagicTokenFactory()
        assert token.is_expired() is False

    def test_old_token_is_expired(self):
        token = MagicTokenFactory()
        # Manually set created_at to 16 minutes ago
        MagicToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(minutes=16)
        )
        token.refresh_from_db()
        assert token.is_expired() is True

    def test_token_at_boundary_not_expired(self):
        token = MagicTokenFactory()
        MagicToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(minutes=14)
        )
        token.refresh_from_db()
        assert token.is_expired() is False


@pytest.mark.django_db
class TestBlockOrdering:
    def test_blocks_ordered_by_order_field(self):
        page = PageFactory()
        b3 = BlockFactory(page=page, type='cta', order=2)
        b1 = BlockFactory(page=page, type='hero', order=0)
        b2 = BlockFactory(page=page, type='features', order=1)

        blocks = list(page.blocks.all())
        assert blocks[0].type == 'hero'
        assert blocks[1].type == 'features'
        assert blocks[2].type == 'cta'

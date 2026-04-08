import pytest

from django.core.cache import cache
from rest_framework import status

from pages.models import Page
from tests.factories import PageFactory, UserFactory


@pytest.mark.django_db
class TestPublicSitemap:
    def setup_method(self, method):
        cache.clear()

    def test_sitemap_xml_only_includes_published_indexable_pages(self, api_client):
        owner = UserFactory()
        published = PageFactory(owner=owner, status=Page.Status.PUBLISHED, slug='published-page')
        draft = PageFactory(owner=owner, status=Page.Status.DRAFT, slug='draft-page')
        noindex = PageFactory(owner=owner, status=Page.Status.PUBLISHED, noindex=True, slug='hidden-page')

        resp = api_client.get('/api/sitemap/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp['content-type'].startswith('application/xml')
        body = resp.content.decode()
        assert f'/p/{published.slug}' in body
        assert f'/p/{draft.slug}' not in body
        assert f'/p/{noindex.slug}' not in body

    def test_sitemap_data_json_only_includes_published_indexable_pages(self, api_client):
        owner = UserFactory()
        published = PageFactory(owner=owner, status=Page.Status.PUBLISHED, slug='published-json')
        draft = PageFactory(owner=owner, status=Page.Status.DRAFT, slug='draft-json')
        noindex = PageFactory(owner=owner, status=Page.Status.PUBLISHED, noindex=True, slug='noindex-json')

        resp = api_client.get('/api/public/sitemap-data/')

        assert resp.status_code == status.HTTP_200_OK
        slugs = [item['slug'] for item in resp.data]
        assert published.slug in slugs
        assert draft.slug not in slugs
        assert noindex.slug not in slugs
        assert resp.data[0]['seo_canonical_url'] == ''

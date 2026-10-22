"""C5 / SEC-004 (ADR-051): an account that has not proved its email publishes like a guest.

Registration takes one request and any address, and published pages live on
the app's own origin: until the owner verifies the email (magic link or
Google) the page is noindex, out of both sitemaps, without Custom HTML, with
a contact form that does not send, and with a notice for visitors.
"""
import json
from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import MagicToken
from tests.factories import BlockFactory, PageFactory, UserFactory

pytestmark = pytest.mark.django_db
URLOPEN = 'pages.revalidation.urllib.request.urlopen'


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


def publish_page_of(owner, slug='pagina'):
    page = PageFactory(owner=owner, slug=slug)
    BlockFactory(page=page, type='hero', order=0, data={'title': 'Hola'})
    BlockFactory(page=page, type='customHtml', order=1, data={'html': '<p>Formulario</p>'})
    BlockFactory(page=page, type='contact', order=2, data={'title': 'Escríbenos'})
    page.publish(owner)
    return page


def public(slug):
    return APIClient().get(f'/api/public/pages/{slug}/').data


@pytest.fixture
def unverified():
    return UserFactory(username='nuevo', email='nuevo@example.com', email_verified=False)


class TestUnverifiedOwner:
    def test_c5_the_public_page_is_noindex_without_custom_html_and_flagged(self, unverified):
        publish_page_of(unverified)
        data = public('pagina')

        assert data['noindex'] is True
        assert data['is_unverified_page'] is True
        assert data['is_guest_page'] is False
        assert [b['type'] for b in data['blocks']] == ['hero', 'contact']

    def test_c5_the_contact_form_does_not_send(self, unverified):
        page = publish_page_of(unverified)
        contact = page.blocks.get(type='contact')
        response = APIClient().post('/api/public/pages/pagina/contact/', {
            'block_id': str(contact.pk), 'name': 'Ana', 'email': 'ana@example.com', 'message': 'Hola',
        }, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'UNVERIFIED_PAGE'

    def test_c5_out_of_both_sitemaps(self, unverified):
        publish_page_of(unverified, slug='sin-verificar')
        publish_page_of(UserFactory(), slug='verificada')

        xml = APIClient().get('/api/sitemap/').content.decode()
        slugs = [item['slug'] for item in APIClient().get('/api/public/sitemap-data/').data]

        assert '/p/verificada' in xml and '/p/sin-verificar' not in xml
        assert slugs == ['verificada']

    def test_a_verified_owner_publishes_everything(self):
        publish_page_of(UserFactory())
        data = public('pagina')
        assert data['is_unverified_page'] is False
        assert 'customHtml' in [b['type'] for b in data['blocks']]

    def test_c5_the_account_says_whether_its_email_is_verified(self, unverified):
        client = APIClient()
        client.force_authenticate(unverified)
        assert client.get('/api/auth/me/').data['email_verified'] is False


class TestVerifyingLiftsTheRestrictions:
    def test_c5_a_magic_link_verifies_and_refreshes_the_published_pages(
        self, settings, unverified, django_capture_on_commit_callbacks,
    ):
        settings.REVALIDATE_SECRET = 'secret'
        settings.FRONTEND_URL = 'http://frontend.test'
        unverified.set_unusable_password()  # no password to take over: a plain verification
        unverified.save()
        publish_page_of(unverified)
        public('pagina')
        APIClient().get('/api/sitemap/')  # cached without the page
        MagicToken.objects.create(email='nuevo@example.com', token='verify-token')

        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            response = APIClient().post('/api/auth/magic/verify/', {'token': 'verify-token'}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert [json.loads(call.args[0].data) for call in urlopen.call_args_list] == [{'slugs': ['pagina']}]
        data = public('pagina')
        assert data['is_unverified_page'] is False
        assert data['noindex'] is False
        assert '/p/pagina' in APIClient().get('/api/sitemap/').content.decode()

    def test_a_claimed_guest_stays_restricted_until_it_verifies(self):
        from accounts.guests import claim_guest, create_guest
        from billing.models import Plan

        Plan.objects.create(name='free', display_name='Free', max_pages=3)
        Plan.objects.create(name='pro', display_name='Pro', max_pages=-1, has_collaboration=True)
        guest = create_guest()
        publish_page_of(guest)
        claim_guest(guest, username='ahora', email='ahora@example.com', password='Sup3r-secret-pw!')

        assert public('pagina')['is_unverified_page'] is True

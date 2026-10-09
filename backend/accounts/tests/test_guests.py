"""Guest mode: temporary accounts to try the editor without signing up."""
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.guests import cleanup_expired_guests, create_guest
from accounts.models import User
from analytics.models import AnalyticsEvent
from billing.models import Plan, Subscription
from billing.permissions import get_user_plan
from pages.models import Asset, Block, Page, PageVersion
from submissions.models import FormSubmission
from tests.factories import BlockFactory, PageFactory, UserFactory, WorkspaceFactory

GUEST_URL = '/api/auth/guest/'
CLAIM_URL = '/api/auth/guest/claim/'
URLOPEN = 'pages.revalidation.urllib.request.urlopen'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
STRONG_PASSWORD = 'Str0ng-pass-123'


@pytest.fixture(autouse=True)
def plans(db):
    free = Plan.objects.create(
        name='free', display_name='Free', max_pages=3, max_version_history=5,
        remove_watermark=False, has_custom_domain=False,
    )
    pro = Plan.objects.create(
        name='pro', display_name='Pro', price_monthly=19, max_pages=-1, max_version_history=-1,
        remove_watermark=True, has_custom_domain=True, has_analytics=True, max_ai_generations_per_hour=10,
    )
    return free, pro


@pytest.fixture(autouse=True)
def media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def real_guest_rate(settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'guest': '3/hour'},
    }


def start_guest(client=None):
    client = client or APIClient()
    resp = client.post(GUEST_URL, {}, format='json')
    assert resp.status_code == status.HTTP_201_CREATED, resp.data
    return client, User.objects.get(pk=resp.data['user']['id'])


def age(user, hours):
    """Make the account `hours` old (created_at is auto_now_add, so use update)."""
    User.objects.filter(pk=user.pk).update(created_at=timezone.now() - timedelta(hours=hours))
    user.refresh_from_db()


def make_expired_guest_with_everything():
    """An expired guest with a published page, versions, a message, an event and an uploaded file."""
    guest = create_guest()
    page = PageFactory(owner=guest, workspace=guest.workspaces.first(), slug='guest-demo')
    BlockFactory(page=page)
    page.publish(guest)
    FormSubmission.objects.create(page=page, name='Ana', email='ana@example.com', message='Hola')
    AnalyticsEvent.objects.create(page=page, visitor_id='v1', event_type='pageview')
    asset = Asset.objects.create(owner=guest, name='logo.png', mime_type='image/png', size=10)
    asset.file.save('logo.png', ContentFile(PNG))
    stored_path = asset.file.path
    age(guest, 25)
    return guest, page, stored_path


@pytest.mark.django_db
class TestGuestCreation:
    def test_creates_a_temporary_user_with_cookies_and_no_tokens_in_the_body(self):
        client, guest = start_guest()
        resp = client.get('/api/auth/me/')

        assert guest.is_guest
        assert guest.username.startswith('invitado-')
        assert guest.email == f'{guest.username}@guest.invalid'
        assert not guest.has_usable_password()
        assert guest.email_verified is False
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['is_guest'] is True

    def test_sets_httponly_cookies(self):
        resp = APIClient().post(GUEST_URL, {}, format='json')
        assert resp.cookies['bp_access']['httponly']
        assert resp.cookies['bp_refresh']['httponly']
        assert 'access' not in json.dumps(resp.data)

    def test_returns_the_expiry_24_hours_after_creation(self):
        resp = APIClient().post(GUEST_URL, {}, format='json')
        guest = User.objects.get(pk=resp.data['user']['id'])
        expires_at = timezone.datetime.fromisoformat(resp.data['user']['expires_at'])
        assert expires_at == guest.created_at + timedelta(hours=24)

    def test_normal_users_are_not_guests_in_me(self, auth_client):
        data = auth_client.get('/api/auth/me/').data
        assert data['is_guest'] is False
        assert data['expires_at'] is None

    def test_guest_workspace_has_an_active_pro_plan_without_stripe(self):
        _, guest = start_guest()
        sub = Subscription.objects.get(workspace__owner=guest)

        assert sub.plan.name == 'pro'
        assert sub.status == Subscription.Status.ACTIVE
        assert sub.stripe_customer_id is None and sub.stripe_subscription_id is None
        assert get_user_plan(guest).name == 'pro'

    def test_every_guest_gets_a_different_identity(self):
        _, first = start_guest()
        _, second = start_guest()
        assert first.username != second.username
        assert first.email != second.email

    def test_a_guest_cannot_log_in_with_a_password(self):
        _, guest = start_guest()
        resp = APIClient().post('/api/auth/login/', {'username': guest.username, 'password': 'cualquiera'}, format='json')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_a_guest_can_create_and_edit_a_page(self):
        client, _ = start_guest()
        resp = client.post('/api/pages/', {'name': 'Mi prueba', 'blocks': []}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
class TestGuestCleanup:
    def test_removes_the_guest_and_everything_it_owns(self):
        guest, page, stored_path = make_expired_guest_with_everything()
        guest_id, page_id = guest.pk, page.pk
        import os
        assert os.path.exists(stored_path)

        assert cleanup_expired_guests() == 1

        assert not User.objects.filter(pk=guest_id).exists()
        assert not Page.objects.filter(pk=page_id).exists()
        assert Block.objects.count() == 0
        assert PageVersion.objects.count() == 0
        assert FormSubmission.objects.count() == 0
        assert AnalyticsEvent.objects.count() == 0
        assert Asset.objects.count() == 0
        assert Subscription.objects.count() == 0
        assert not os.path.exists(stored_path)

    def test_keeps_fresh_guests_and_normal_accounts(self):
        _, fresh = start_guest()
        old_account = UserFactory()
        age(old_account, 500)
        expired, _, _ = make_expired_guest_with_everything()

        assert cleanup_expired_guests() == 1

        assert User.objects.filter(pk=fresh.pk).exists()
        assert User.objects.filter(pk=old_account.pk).exists()
        assert not User.objects.filter(pk=expired.pk).exists()

    def test_deletes_their_refresh_tokens(self):
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        _, guest = start_guest()
        assert OutstandingToken.objects.filter(user=guest).exists()
        age(guest, 25)
        cleanup_expired_guests()
        assert OutstandingToken.objects.count() == 0

    def test_asks_the_frontend_to_drop_the_cached_public_page(self, settings, django_capture_on_commit_callbacks):
        settings.REVALIDATE_SECRET = 'secret'
        settings.FRONTEND_URL = 'http://frontend.test'
        make_expired_guest_with_everything()

        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            cleanup_expired_guests()

        [request] = [call.args[0] for call in urlopen.call_args_list]
        assert json.loads(request.data) == {'slugs': ['guest-demo']}

    def test_starting_a_guest_sweeps_the_expired_ones_first(self):
        expired, _, _ = make_expired_guest_with_everything()
        start_guest()
        assert not User.objects.filter(pk=expired.pk).exists()

    def test_a_failing_sweep_does_not_block_a_new_guest(self):
        with patch('accounts.guests.cleanup_expired_guests', side_effect=RuntimeError('boom')):
            start_guest()

    def test_management_command_deletes_every_expired_guest(self):
        for _ in range(3):
            guest = create_guest()
            age(guest, 30)
        out = StringIO()
        call_command('cleanup_guests', stdout=out)
        assert 'Deleted 3' in out.getvalue()
        assert User.objects.filter(is_guest=True).count() == 0


@pytest.mark.django_db
class TestGuestExpiry:
    def test_an_expired_guest_session_is_rejected_even_with_a_valid_jwt(self):
        client, guest = start_guest()
        assert client.get('/api/auth/me/').status_code == status.HTTP_200_OK

        age(guest, 25)
        resp = client.get('/api/auth/me/')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'GUEST_EXPIRED'

    def test_an_expired_guest_cannot_refresh_its_session(self):
        client, guest = start_guest()
        age(guest, 25)

        resp = client.post('/api/auth/refresh/', {}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'GUEST_EXPIRED'
        assert resp.cookies['bp_access'].value == ''

    def test_a_live_guest_can_refresh(self):
        client, _ = start_guest()
        assert client.post('/api/auth/refresh/', {}, format='json').status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestGuestAbuseLimits:
    def test_creation_is_throttled_per_ip(self, real_guest_rate):
        codes = [APIClient().post(GUEST_URL, {}, format='json').status_code for _ in range(4)]
        assert codes == [201, 201, 201, status.HTTP_429_TOO_MANY_REQUESTS]

    def test_a_spoofed_forwarded_for_does_not_reset_the_throttle(self, real_guest_rate):
        codes = [
            APIClient().post(GUEST_URL, {}, format='json', HTTP_X_FORWARDED_FOR=f'203.0.113.{i}').status_code
            for i in range(4)
        ]
        assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS

    def test_another_ip_has_its_own_allowance(self, real_guest_rate):
        for _ in range(3):
            APIClient().post(GUEST_URL, {}, format='json')
        resp = APIClient().post(GUEST_URL, {}, format='json', REMOTE_ADDR='198.51.100.9')
        assert resp.status_code == status.HTTP_201_CREATED

    def test_capacity_cap_returns_503_with_a_code(self, settings):
        settings.GUEST_MAX_ACTIVE = 2
        start_guest()
        start_guest()
        resp = APIClient().post(GUEST_URL, {}, format='json')

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert resp.data['code'] == 'GUEST_CAPACITY'
        assert User.objects.filter(is_guest=True).count() == 2

    def test_expired_guests_free_their_slot(self, settings):
        settings.GUEST_MAX_ACTIVE = 1
        _, guest = start_guest()
        age(guest, 25)
        start_guest()  # the sweep makes room

    def test_page_limit(self, settings):
        settings.GUEST_MAX_PAGES = 2
        client, _ = start_guest()
        for _ in range(2):
            assert client.post('/api/pages/', {'name': 'p', 'blocks': []}, format='json').status_code == 201
        resp = client.post('/api/pages/', {'name': 'p', 'blocks': []}, format='json')

        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_PAGE_LIMIT'

    def test_duplicating_counts_against_the_page_limit(self, settings):
        settings.GUEST_MAX_PAGES = 1
        client, _ = start_guest()
        page = client.post('/api/pages/', {'name': 'p', 'blocks': []}, format='json').data
        resp = client.post(f'/api/pages/{page["id"]}/duplicate/')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_PAGE_LIMIT'

    def test_asset_uploads_are_refused(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        client, _ = start_guest()
        resp = client.post('/api/assets/', {'file': SimpleUploadedFile('a.png', PNG, content_type='image/png')}, format='multipart')

        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_NOT_ALLOWED'
        assert Asset.objects.count() == 0

    def test_listing_assets_is_still_allowed(self):
        client, _ = start_guest()
        assert client.get('/api/assets/').status_code == status.HTTP_200_OK

    @pytest.mark.parametrize('url', ['/api/billing/checkout/', '/api/billing/portal/'])
    def test_billing_is_refused(self, url):
        client, _ = start_guest()
        resp = client.post(url, {'cycle': 'monthly'}, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_NOT_ALLOWED'

    def test_custom_domains_are_refused_despite_the_pro_plan(self):
        client, guest = start_guest()
        page = PageFactory(owner=guest)
        resp = client.post('/api/domains/', {'domain': 'demo.example.com', 'page': str(page.id)}, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_NOT_ALLOWED'
        assert client.get('/api/domains/').status_code == status.HTTP_403_FORBIDDEN

    def test_sharing_a_page_is_refused_so_guests_cannot_send_email(self, mailoutbox):
        client, guest = start_guest()
        page = PageFactory(owner=guest)
        UserFactory(email='victim@example.com')
        resp = client.post(f'/api/pages/{page.id}/share/', {'email': 'victim@example.com'}, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert mailoutbox == []

    def test_saved_versions_are_capped_despite_unlimited_pro_history(self):
        client, guest = start_guest()
        page = PageFactory(owner=guest)
        for _ in range(15):
            client.post(f'/api/pages/{page.id}/versions/', {}, format='json')
        assert page.versions.count() == 10


@pytest.mark.django_db
class TestGuestPublishedPages:
    def publish_guest_page(self):
        client, guest = start_guest()
        page = PageFactory(owner=guest, slug='demo-invitado')
        BlockFactory(page=page)
        assert client.post(f'/api/pages/{page.id}/publish/').status_code == status.HTTP_200_OK
        return page

    def test_public_page_is_noindex_with_watermark_even_on_pro(self, api_client):
        self.publish_guest_page()
        data = api_client.get('/api/public/pages/demo-invitado/').data
        assert data['noindex'] is True
        assert data['show_watermark'] is True

    def test_noindex_is_forced_even_if_the_page_said_otherwise(self, api_client):
        page = self.publish_guest_page()
        page.refresh_from_db()
        assert page.published_version.page_metadata['noindex'] is False
        assert api_client.get('/api/public/pages/demo-invitado/').data['noindex'] is True

    def test_excluded_from_both_sitemaps(self, api_client):
        self.publish_guest_page()
        normal = UserFactory()
        regular = PageFactory(owner=normal, slug='pagina-normal')
        regular.publish(normal)
        cache.clear()

        xml = api_client.get('/api/sitemap/').content.decode()
        slugs = [item['slug'] for item in api_client.get('/api/public/sitemap-data/').data]

        assert 'pagina-normal' in xml and 'demo-invitado' not in xml
        assert 'pagina-normal' in slugs and 'demo-invitado' not in slugs

    def test_a_normal_pro_page_keeps_index_and_no_watermark(self, api_client, plans):
        owner = UserFactory()
        workspace = WorkspaceFactory(owner=owner)
        Subscription.objects.filter(workspace=workspace).update(plan=plans[1], status='active')
        page = PageFactory(owner=owner, slug='pro-normal')
        page.publish(owner)
        data = api_client.get('/api/public/pages/pro-normal/').data
        assert data['noindex'] is False
        assert data['show_watermark'] is False

    def test_guest_pages_cannot_carry_custom_html_and_say_they_are_demos(self, api_client):
        """Anyone can create a guest, so their public pages must not work for phishing."""
        client, guest = start_guest()
        page = PageFactory(owner=guest, slug='demo-html')
        BlockFactory(page=page, type='hero', order=0)
        BlockFactory(page=page, type='customHtml', order=1, data={'html': '<form>Contraseña</form>'})
        client.post(f'/api/pages/{page.id}/publish/')

        data = api_client.get('/api/public/pages/demo-html/').data

        assert data['is_guest_page'] is True
        assert [b['type'] for b in data['blocks']] == ['hero']

    def test_guest_pages_do_not_collect_contact_messages(self, api_client):
        client, guest = start_guest()
        page = PageFactory(owner=guest, slug='demo-contacto')
        BlockFactory(page=page, type='contact', order=0, data={'title': 'Escríbenos'})
        client.post(f'/api/pages/{page.id}/publish/')

        resp = api_client.post('/api/public/pages/demo-contacto/contact/', {
            'name': 'Ana', 'email': 'ana@example.com', 'message': 'Hola',
        }, format='json')

        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_PAGE'
        assert not FormSubmission.objects.filter(page=page).exists()

    def test_normal_pages_are_not_marked_as_guest_pages(self, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner, slug='normal-html')
        BlockFactory(page=page, type='customHtml', order=0, data={'html': '<p>Hola</p>'})
        page.publish(owner)

        data = api_client.get('/api/public/pages/normal-html/').data

        assert data['is_guest_page'] is False
        assert [b['type'] for b in data['blocks']] == ['customHtml']

    def test_the_public_page_disappears_with_the_guest(self, api_client):
        page = self.publish_guest_page()
        age(page.owner, 25)
        cleanup_expired_guests()
        assert api_client.get('/api/public/pages/demo-invitado/').status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestGuestClaim:
    def claim_data(self, **overrides):
        return {
            'username': 'ana', 'email': 'ana@example.com',
            'password': STRONG_PASSWORD, 'password2': STRONG_PASSWORD,
            **overrides,
        }

    def guest_with_pages(self, count=2):
        client, guest = start_guest()
        pages = [PageFactory(owner=guest, workspace=guest.workspaces.first()) for _ in range(count)]
        return client, guest, pages

    def test_turns_the_guest_into_a_normal_account_and_keeps_its_pages(self):
        client, guest, pages = self.guest_with_pages()
        resp = client.post(CLAIM_URL, self.claim_data(), format='json')

        assert resp.status_code == status.HTTP_200_OK
        guest.refresh_from_db()
        assert guest.is_guest is False
        assert guest.username == 'ana' and guest.email == 'ana@example.com'
        assert guest.email_verified is False
        assert guest.check_password(STRONG_PASSWORD)
        assert set(Page.objects.filter(owner=guest)) == set(pages)
        assert resp.data['user']['is_guest'] is False
        assert resp.data['user']['expires_at'] is None

    def test_the_account_survives_the_cleanup(self):
        client, guest, pages = self.guest_with_pages()
        client.post(CLAIM_URL, self.claim_data(), format='json')
        age(guest, 100)
        assert cleanup_expired_guests() == 0
        assert Page.objects.filter(owner=guest).count() == 2

    def test_downgrades_to_the_free_plan(self):
        client, guest, _ = self.guest_with_pages()
        client.post(CLAIM_URL, self.claim_data(), format='json')

        sub = Subscription.objects.get(workspace__owner=guest)
        assert sub.plan.name == 'free'
        assert sub.status == Subscription.Status.FREE
        assert get_user_plan(guest).name == 'free'

    def test_pages_beyond_the_free_limit_stay_but_no_new_ones_are_allowed(self):
        client, guest, pages = self.guest_with_pages(count=5)
        client.post(CLAIM_URL, self.claim_data(), format='json')

        assert Page.objects.filter(owner=guest).count() == 5
        resp = client.post('/api/pages/', {'name': 'otra', 'blocks': []}, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['error'] == 'plan_limit'

    def test_rotates_the_session(self):
        client, guest, _ = self.guest_with_pages()
        old_refresh = client.cookies['bp_refresh'].value
        resp = client.post(CLAIM_URL, self.claim_data(), format='json')

        assert resp.cookies['bp_access'].value
        assert resp.cookies['bp_refresh'].value != old_refresh
        assert client.get('/api/auth/me/').data['is_guest'] is False

        stolen = APIClient()
        stolen.cookies['bp_refresh'] = old_refresh
        assert stolen.post('/api/auth/refresh/', {}, format='json').status_code == status.HTTP_401_UNAUTHORIZED

    def test_the_new_credentials_work_for_login(self):
        client, _, _ = self.guest_with_pages()
        client.post(CLAIM_URL, self.claim_data(), format='json')
        resp = APIClient().post('/api/auth/login/', {'username': 'ana', 'password': STRONG_PASSWORD}, format='json')
        assert resp.status_code == status.HTTP_200_OK

    def test_published_pages_are_revalidated_and_indexable_again(self, settings, api_client, django_capture_on_commit_callbacks):
        settings.REVALIDATE_SECRET = 'secret'
        settings.FRONTEND_URL = 'http://frontend.test'
        client, guest, _ = self.guest_with_pages(count=1)
        page = PageFactory(owner=guest, slug='publicada')
        page.publish(guest)

        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            client.post(CLAIM_URL, self.claim_data(), format='json')

        [request] = [call.args[0] for call in urlopen.call_args_list]
        assert json.loads(request.data) == {'slugs': ['publicada']}
        data = api_client.get('/api/public/pages/publicada/').data
        assert data['noindex'] is False
        assert data['show_watermark'] is True  # Free plan

    @pytest.mark.parametrize('overrides, field', [
        ({'password2': 'otra-cosa-distinta'}, 'password2'),
        ({'password': '123', 'password2': '123'}, 'password'),
        ({'password': 'password', 'password2': 'password'}, 'password'),
        ({'email': 'no-es-un-email'}, 'email'),
        ({'email': 'alguien@guest.invalid'}, 'email'),
        ({'username': ''}, 'username'),
    ])
    def test_validates_like_register(self, overrides, field):
        client, guest, _ = self.guest_with_pages()
        resp = client.post(CLAIM_URL, self.claim_data(**overrides), format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert field in resp.data['details']
        guest.refresh_from_db()
        assert guest.is_guest is True

    def test_missing_fields_are_rejected(self):
        client, _, _ = self.guest_with_pages()
        assert client.post(CLAIM_URL, {}, format='json').status_code == status.HTTP_400_BAD_REQUEST

    def test_taken_username_and_email_are_rejected(self):
        UserFactory(username='ana', email='taken@example.com')
        client, _, _ = self.guest_with_pages()
        assert client.post(CLAIM_URL, self.claim_data(), format='json').status_code == status.HTTP_400_BAD_REQUEST
        resp = client.post(CLAIM_URL, self.claim_data(username='ana2', email='taken@example.com'), format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_a_normal_user_cannot_claim(self, auth_client):
        resp = auth_client.post(CLAIM_URL, self.claim_data(), format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'NOT_GUEST'

    def test_anonymous_cannot_claim(self):
        resp = APIClient().post(CLAIM_URL, self.claim_data(), format='json')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_an_expired_guest_cannot_claim(self):
        client, guest, _ = self.guest_with_pages()
        age(guest, 25)
        resp = client.post(CLAIM_URL, self.claim_data(), format='json')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'GUEST_EXPIRED'


@pytest.mark.django_db
class TestRegisterReservedDomain:
    def test_register_rejects_the_guest_placeholder_domain(self):
        resp = APIClient().post('/api/auth/register/', {
            'username': 'sneaky', 'email': 'sneaky@guest.invalid',
            'password': STRONG_PASSWORD, 'password2': STRONG_PASSWORD,
        }, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

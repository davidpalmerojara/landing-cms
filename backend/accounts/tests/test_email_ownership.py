"""Pre-account takeover: someone registers the victim's email with their own
password before the victim signs up (sign-up does not verify emails). When the
victim later proves they own the email (magic link or Google), the attacker
must lose every way into the account."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from asgiref.sync import async_to_sync
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from collaboration.middleware import get_user_from_token
from tests.factories import MagicTokenFactory, PageFactory, UserFactory

VICTIM_EMAIL = 'victim@example.com'


def client_with_session(user, issued_seconds_ago=60):
    """A logged-in client whose tokens were issued some time ago."""
    issued_at = timezone.now() - timedelta(seconds=issued_seconds_ago)
    refresh = RefreshToken.for_user(user)
    refresh.set_iat(at_time=issued_at)
    access = refresh.access_token
    access.set_iat(at_time=issued_at)
    client = APIClient()
    client.cookies['bp_access'] = str(access)
    client.cookies['bp_refresh'] = str(refresh)
    return client, str(access)


def sign_in_with_magic_link(email=VICTIM_EMAIL):
    MagicTokenFactory(email=email, token='victim-magic-token')
    client = APIClient()
    resp = client.post('/api/auth/magic/verify/', {'token': 'victim-magic-token'}, format='json')
    return client, resp


@pytest.fixture
def attacker_account():
    """Account registered with the victim's email and the attacker's password."""
    return UserFactory(username='squatter', email=VICTIM_EMAIL)


@pytest.mark.django_db
class TestMagicLinkTakesOverUnverifiedAccount:
    def test_victim_gets_in_and_is_told_the_password_was_disabled(self, attacker_account):
        _, resp = sign_in_with_magic_link()

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['password_disabled'] is True
        attacker_account.refresh_from_db()
        assert attacker_account.email_verified is True

    def test_attacker_password_stops_working(self, attacker_account):
        sign_in_with_magic_link()

        resp = APIClient().post('/api/auth/login/', {'username': 'squatter', 'password': 'testpass123'}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_attacker_access_token_is_rejected(self, attacker_account):
        attacker, _ = client_with_session(attacker_account)
        assert attacker.get('/api/auth/me/').status_code == status.HTTP_200_OK

        sign_in_with_magic_link()

        assert attacker.get('/api/auth/me/').status_code == status.HTTP_401_UNAUTHORIZED

    def test_attacker_access_token_is_rejected_in_the_authorization_header(self, attacker_account):
        _, access = client_with_session(attacker_account)
        sign_in_with_magic_link()

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        assert client.get('/api/auth/me/').status_code == status.HTTP_401_UNAUTHORIZED

    def test_attacker_refresh_token_is_rejected(self, attacker_account):
        attacker, _ = client_with_session(attacker_account)
        sign_in_with_magic_link()

        resp = attacker.post('/api/auth/refresh/', {}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    # database_sync_to_async closes "old" connections; inside a test transaction
    # on PostgreSQL that is the test's own connection, so this test needs real commits
    @pytest.mark.django_db(transaction=True)
    def test_attacker_token_cannot_open_the_collaboration_socket(self, attacker_account):
        _, access = client_with_session(attacker_account)
        sign_in_with_magic_link()

        user = async_to_sync(get_user_from_token)(access)

        assert user.is_anonymous

    def test_pages_are_no_longer_shared_with_the_attacker(self, attacker_account):
        accomplice = UserFactory()
        page = PageFactory(owner=attacker_account)
        page.collaborators.add(accomplice)

        sign_in_with_magic_link()

        assert page.collaborators.count() == 0

    def test_victim_new_session_works(self, attacker_account):
        victim, _ = sign_in_with_magic_link()

        resp = victim.get('/api/auth/me/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['email'] == VICTIM_EMAIL


@pytest.mark.django_db
class TestMagicLinkOnVerifiedAccounts:
    def test_verified_account_keeps_its_password_and_sessions(self):
        user = UserFactory(username='owner', email=VICTIM_EMAIL, email_verified=True)
        other_device, _ = client_with_session(user)

        _, resp = sign_in_with_magic_link()

        assert resp.status_code == status.HTTP_200_OK
        assert 'password_disabled' not in resp.data
        assert other_device.get('/api/auth/me/').status_code == status.HTTP_200_OK
        login = APIClient().post('/api/auth/login/', {'username': 'owner', 'password': 'testpass123'}, format='json')
        assert login.status_code == status.HTTP_200_OK

    def test_passwordless_account_is_not_reported_as_taken_over(self):
        user = UserFactory(email=VICTIM_EMAIL)
        user.set_unusable_password()
        user.save()

        _, resp = sign_in_with_magic_link()

        assert 'password_disabled' not in resp.data
        user.refresh_from_db()
        assert user.email_verified is True

    def test_new_account_from_magic_link_is_verified(self):
        _, resp = sign_in_with_magic_link('brand-new@example.com')

        assert resp.status_code == status.HTTP_200_OK
        assert User.objects.get(email='brand-new@example.com').email_verified is True

    def test_second_magic_link_does_not_revoke_again(self, attacker_account):
        sign_in_with_magic_link()
        revoked_at = User.objects.get(email=VICTIM_EMAIL).sessions_revoked_at

        MagicTokenFactory(email=VICTIM_EMAIL, token='second-token')
        resp = APIClient().post('/api/auth/magic/verify/', {'token': 'second-token'}, format='json')

        assert 'password_disabled' not in resp.data
        assert User.objects.get(email=VICTIM_EMAIL).sessions_revoked_at == revoked_at


GOOGLE_VICTIM = {
    'sub': 'victim-google-sub',
    'email': VICTIM_EMAIL,
    'email_verified': True,
    'name': 'Victim',
    'picture': 'https://example.com/victim.png',
}


@pytest.mark.django_db
class TestGoogleTakesOverUnverifiedAccount:
    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token', return_value=GOOGLE_VICTIM)
    def test_google_sign_in_disables_the_unverified_password(self, _verify, attacker_account):
        attacker, _ = client_with_session(attacker_account)

        resp = APIClient().post('/api/auth/google/', {'token': 'victim-token'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['password_disabled'] is True
        attacker_account.refresh_from_db()
        assert attacker_account.google_id == 'victim-google-sub'
        assert attacker_account.has_usable_password() is False
        assert attacker.get('/api/auth/me/').status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token', return_value=GOOGLE_VICTIM)
    def test_new_google_account_is_verified(self, _verify):
        APIClient().post('/api/auth/google/', {'token': 'victim-token'}, format='json')

        assert User.objects.get(email=VICTIM_EMAIL).email_verified is True

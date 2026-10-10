from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import MagicToken
from tests.factories import UserFactory


@pytest.fixture(autouse=True)
def real_rates(settings):
    """conftest disables throttling; these tests need the production rates."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {'anon': '60/minute', 'user': '120/minute', 'auth': '10/minute', 'login_username': '5/minute'},
    }


def login(client, username, password='wrong-password', **extra):
    return client.post('/api/auth/login/', {'username': username, 'password': password}, format='json', **extra)


@pytest.mark.django_db
class TestLoginThrottling:
    def test_spoofed_x_forwarded_for_does_not_reset_the_ip_limit(self):
        client = APIClient()
        codes = [
            login(client, f'nobody{i}', HTTP_X_FORWARDED_FOR=f'203.0.113.{i}').status_code
            for i in range(12)
        ]
        assert status.HTTP_429_TOO_MANY_REQUESTS in codes

    def test_attempts_against_one_account_are_limited_across_ips(self):
        UserFactory(username='target')
        codes = [
            login(APIClient(), 'Target', REMOTE_ADDR=f'198.51.100.{i}').status_code
            for i in range(7)
        ]
        assert codes[:5] == [status.HTTP_401_UNAUTHORIZED] * 5
        assert codes[5] == status.HTTP_429_TOO_MANY_REQUESTS

    def test_other_accounts_are_not_affected(self):
        UserFactory(username='target2')
        UserFactory(username='innocent')
        for i in range(6):
            login(APIClient(), 'target2', REMOTE_ADDR=f'198.51.100.{i}')
        resp = login(APIClient(), 'innocent', password='testpass123', REMOTE_ADDR='192.0.2.1')
        assert resp.status_code == status.HTTP_200_OK


# --- SEC2-001 ----------------------------------------------------------------

def signed_in_client():
    """A real browser-like session: the cookies of a new guest (one click on the site)."""
    client = APIClient()
    assert client.post('/api/auth/guest/', format='json').status_code == status.HTTP_201_CREATED
    return client


@pytest.fixture
def guest_rate(settings):
    settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
        **settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'guest': '1000/hour',
    }


@pytest.mark.django_db
@pytest.mark.usefixtures('guest_rate')
class TestAuthLimitAppliesToSignedInRequests:
    """SEC2-001: a session cookie used to lift the per-IP auth limit (AnonRateThrottle skips signed-in requests)."""

    def test_magic_link_requests_with_a_session_are_limited(self, mailoutbox):
        client = signed_in_client()
        codes = [
            client.post('/api/auth/magic/request/', {'email': f'victim{i}@example.com'}, format='json').status_code
            for i in range(12)
        ]
        assert codes[:10] == [status.HTTP_200_OK] * 10
        assert codes[10:] == [status.HTTP_429_TOO_MANY_REQUESTS] * 2
        assert len(mailoutbox) == 10

    def test_sign_ups_with_a_session_are_limited(self):
        client = signed_in_client()
        codes = [
            client.post('/api/auth/register/', {
                'username': f'flood{i}', 'email': f'flood{i}@example.com',
                'password': 'Sup3r-secret-pw', 'password2': 'Sup3r-secret-pw',
            }, format='json').status_code
            for i in range(12)
        ]
        assert codes.count(status.HTTP_201_CREATED) == 10
        assert codes[-1] == status.HTTP_429_TOO_MANY_REQUESTS

    @pytest.mark.parametrize('path, body', [
        ('/api/auth/magic/verify/', {'token': 'guess'}),
        ('/api/auth/join/', {'token': 'guess'}),
        ('/api/auth/google/', {'token': 'guess'}),
    ])
    def test_other_auth_endpoints_with_a_session_are_limited(self, path, body):
        client = signed_in_client()
        codes = [client.post(path, body, format='json').status_code for _ in range(11)]
        assert status.HTTP_429_TOO_MANY_REQUESTS not in codes[:10]
        assert codes[10] == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestMagicLinkPerRecipientCap:
    """SEC2-001: whatever the IP, one inbox gets at most MAGIC_LINK_EMAIL_LIMIT links per 15 minutes."""

    def test_an_inbox_gets_three_links_then_the_same_answer_and_no_email(self, mailoutbox):
        answers = [
            APIClient().post('/api/auth/magic/request/', {'email': 'Victim@example.com'}, format='json',
                             REMOTE_ADDR=f'198.51.100.{i}')
            for i in range(5)
        ]
        assert [a.status_code for a in answers] == [status.HTTP_200_OK] * 5
        assert len({a.data['message'] for a in answers}) == 1  # nothing tells the caller it was dropped
        assert len(mailoutbox) == 3
        assert MagicToken.objects.filter(email='victim@example.com').count() == 3
        # The last link sent still works: a dropped request does not invalidate it
        assert MagicToken.objects.filter(email='victim@example.com', used=False).count() == 1

    def test_the_cap_resets_after_the_window(self, mailoutbox):
        for _ in range(3):
            APIClient().post('/api/auth/magic/request/', {'email': 'later@example.com'}, format='json')
        MagicToken.objects.filter(email='later@example.com').update(created_at=timezone.now() - timedelta(minutes=16))
        resp = APIClient().post('/api/auth/magic/request/', {'email': 'later@example.com'}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert len(mailoutbox) == 4

    def test_other_inboxes_are_not_affected(self, mailoutbox):
        for _ in range(4):
            APIClient().post('/api/auth/magic/request/', {'email': 'busy@example.com'}, format='json')
        APIClient().post('/api/auth/magic/request/', {'email': 'calm@example.com'}, format='json')
        assert [m.to for m in mailoutbox].count(['calm@example.com']) == 1

import pytest
from rest_framework import status
from rest_framework.test import APIClient

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

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from submissions.models import FormSubmission
from tests.factories import BlockFactory, PageFactory, UserFactory

VALID = {'name': 'Ana', 'email': 'ana@example.com', 'message': 'Hola'}


@pytest.fixture(autouse=True)
def real_rates(settings):
    """conftest disables throttling; these tests need the production rates."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {
            'anon': '60/minute', 'user': '120/minute', 'auth': '10/minute',
            'login_username': '5/minute', 'contact': '5/minute',
        },
    }


@pytest.fixture
def slug():
    owner = UserFactory()
    page = PageFactory(owner=owner)
    BlockFactory(page=page, type='contact')
    page.publish(owner)
    return page.slug


def post(client, slug, **extra):
    return client.post(f'/api/public/pages/{slug}/contact/', VALID, format='json', **extra)


@pytest.mark.django_db
class TestContactThrottling:
    def test_sixth_request_in_a_minute_is_throttled(self, slug):
        client = APIClient()
        codes = [post(client, slug).status_code for _ in range(6)]
        assert codes[:5] == [status.HTTP_201_CREATED] * 5
        assert codes[5] == status.HTTP_429_TOO_MANY_REQUESTS
        assert FormSubmission.objects.count() == 5

    def test_throttled_response_uses_the_error_envelope(self, slug):
        client = APIClient()
        for _ in range(5):
            post(client, slug)
        resp = post(client, slug)
        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert resp.data['code'] == 'THROTTLED'
        assert 'error' in resp.data

    def test_honeypot_requests_count_towards_the_limit(self, slug):
        client = APIClient()
        for _ in range(5):
            client.post(f'/api/public/pages/{slug}/contact/', {**VALID, 'website': 'x'}, format='json')
        assert post(client, slug).status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_other_ips_are_not_affected(self, slug):
        for _ in range(6):
            post(APIClient(), slug, REMOTE_ADDR='198.51.100.1')
        assert post(APIClient(), slug, REMOTE_ADDR='198.51.100.2').status_code == status.HTTP_201_CREATED

    def test_spoofed_x_forwarded_for_does_not_reset_the_limit(self, slug):
        client = APIClient()
        codes = [
            post(client, slug, HTTP_X_FORWARDED_FOR=f'203.0.113.{i}').status_code
            for i in range(7)
        ]
        assert status.HTTP_429_TOO_MANY_REQUESTS in codes

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from collaboration.middleware import access_token_from_scope
from tests.factories import UserFactory

APP_ORIGIN = 'http://localhost:3000'


def logged_in_client(username='cookieuser'):
    UserFactory(username=username)
    client = APIClient()
    resp = client.post('/api/auth/login/', {'username': username, 'password': 'testpass123'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    return client


@pytest.mark.django_db
class TestCookieOnlyAuth:
    def test_register_does_not_return_tokens_in_body(self):
        resp = APIClient().post('/api/auth/register/', {
            'username': 'newbie', 'email': 'newbie@example.com',
            'password': 'Str0ng-pass-123', 'password2': 'Str0ng-pass-123',
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert 'tokens' not in resp.data
        assert 'bp_access' in resp.cookies

    def test_cookie_alone_authenticates_requests(self):
        client = logged_in_client()
        assert client.get('/api/auth/me/').status_code == status.HTTP_200_OK

    def test_refresh_without_cookie_is_401_not_500(self):
        resp = APIClient().post('/api/auth/refresh/', {}, format='json')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'NO_REFRESH_TOKEN'

    def test_rotated_refresh_token_cannot_be_reused(self):
        client = logged_in_client()
        old_refresh = client.cookies['bp_refresh'].value
        client.post('/api/auth/refresh/', {}, format='json')

        replay = APIClient()
        replay.cookies['bp_refresh'] = old_refresh
        assert replay.post('/api/auth/refresh/', {}, format='json').status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_revokes_the_refresh_token(self):
        client = logged_in_client()
        refresh = client.cookies['bp_refresh'].value
        assert client.post('/api/auth/logout/', {}, format='json').status_code == status.HTTP_200_OK

        stolen = APIClient()
        stolen.cookies['bp_refresh'] = refresh
        assert stolen.post('/api/auth/refresh/', {}, format='json').status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_works_with_an_invalid_access_cookie(self):
        client = APIClient()
        client.cookies['bp_access'] = 'not-a-jwt'
        assert client.post('/api/auth/logout/', {}, format='json').status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestOriginCheck:
    def test_rejects_state_change_with_cookies_from_foreign_origin(self):
        client = logged_in_client()
        resp = client.post('/api/pages/', {'name': 'x', 'blocks': []}, format='json', HTTP_ORIGIN='https://evil.example')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.json()['code'] == 'CSRF_ORIGIN'

    def test_uses_referer_when_origin_is_missing(self):
        client = logged_in_client()
        resp = client.post('/api/pages/', {'name': 'x', 'blocks': []}, format='json', HTTP_REFERER='https://evil.example/page')
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_allows_state_change_from_the_app_origin(self):
        client = logged_in_client()
        resp = client.post('/api/pages/', {'name': 'x', 'blocks': []}, format='json', HTTP_ORIGIN=APP_ORIGIN)
        assert resp.status_code == status.HTTP_201_CREATED

    def test_rejects_login_from_foreign_origin(self):
        UserFactory(username='victim')
        resp = APIClient().post('/api/auth/login/', {'username': 'victim', 'password': 'testpass123'},
                                format='json', HTTP_ORIGIN='https://evil.example')
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_requests_without_auth_cookies_are_not_checked(self):
        # e.g. analytics beacons sent from published pages on other domains
        resp = APIClient().get('/api/billing/plans/', HTTP_ORIGIN='https://customer-domain.example')
        assert resp.status_code == status.HTTP_200_OK


def test_websocket_reads_access_token_from_cookie_header():
    scope = {'headers': [(b'host', b'localhost'), (b'cookie', b'paxl-locale=es; bp_access=abc.def.ghi')]}
    assert access_token_from_scope(scope) == 'abc.def.ghi'

    # Real browser header: Google's g_state cookie holds JSON before bp_access
    google = b'paxl-locale=es; g_state={"i_l":0,"i_ll":1791493022609}; bp_access=abc.def.ghi'
    assert access_token_from_scope({'headers': [(b'cookie', google)]}) == 'abc.def.ghi'
    assert access_token_from_scope({'headers': []}) is None

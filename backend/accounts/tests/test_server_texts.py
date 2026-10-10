"""APP2-009: the auth answers follow Accept-Language, and an empty sign-in is a wrong sign-in, not a 400."""
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

EN = {'HTTP_ACCEPT_LANGUAGE': 'en'}


def login(username, password='testpass123', **extra):
    return APIClient().post('/api/auth/login/', {'username': username, 'password': password}, format='json', **extra)


class TestEmptySignIn:
    @pytest.mark.parametrize('username, password', [('   ', 'testpass123'), ('', 'testpass123'), ('someone', '')])
    def test_blank_fields_answer_like_wrong_credentials(self, username, password):
        resp = login(username, password)

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'INVALID_CREDENTIALS'

    def test_a_real_sign_in_still_works(self):
        UserFactory(username='realone')

        assert login('realone').status_code == status.HTTP_200_OK


class TestTextsFollowTheLanguage:
    def test_sign_in_message(self):
        UserFactory(username='texts')

        assert login('texts', **EN).data['message'] == 'Signed in.'
        assert login('texts').data['message'] == 'Sesión iniciada.'

    def test_invalid_magic_link(self):
        resp = APIClient().post('/api/auth/magic/verify/', {'token': 'nope'}, format='json', **EN)

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data == {'error': 'The link is invalid or has expired.', 'code': 'MAGIC_LINK_INVALID'}

    def test_validation_envelope(self):
        resp = APIClient().post('/api/auth/register/', {}, format='json', **EN)

        assert resp.data['error'] == 'Validation error.'
        assert resp.data['code'] == 'BAD_REQUEST'

    def test_magic_link_request(self, mailoutbox):
        resp = APIClient().post('/api/auth/magic/request/', {'email': 'x@example.com'}, format='json', **EN)

        assert resp.data['message'] == 'If the email exists, you will get a sign-in link.'

    def test_spanish_stays_the_default(self):
        resp = APIClient().post('/api/auth/register/', {}, format='json')

        assert resp.data['error'] == 'Error de validación.'

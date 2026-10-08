from django.test import override_settings
from rest_framework import status
from unittest.mock import patch

import pytest

from accounts.models import User
from tests.factories import UserFactory


GOOGLE_IDINFO = {
    'sub': 'google-sub-123',
    'email': 'newuser@example.com',
    'email_verified': True,
    'name': 'New User',
    'picture': 'https://example.com/avatar.png',
}


@pytest.mark.django_db
class TestGoogleOAuth:
    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token', return_value=GOOGLE_IDINFO)
    def test_valid_token_creates_user_and_returns_jwt(self, mock_verify, api_client):
        resp = api_client.post(
            '/api/auth/google/',
            {'token': 'valid-google-token'},
            format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        assert 'tokens' not in resp.data
        assert 'bp_access' in resp.cookies
        user = User.objects.get(email='newuser@example.com')
        assert user.google_id == 'google-sub-123'
        assert user.avatar == 'https://example.com/avatar.png'

    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token', side_effect=ValueError('invalid token'))
    def test_invalid_token_returns_401(self, mock_verify, api_client):
        resp = api_client.post(
            '/api/auth/google/',
            {'token': 'invalid-token'},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token')
    def test_does_not_link_google_to_an_account_with_a_password(self, mock_verify, api_client):
        """Pre-account takeover: someone registered the victim's email with their
        own password (emails are not verified on sign-up). Linking the victim's
        Google login to that account would let the attacker in."""
        attacker_made = UserFactory(email='victim@example.com')
        mock_verify.return_value = {**GOOGLE_IDINFO, 'sub': 'victim-google-sub', 'email': 'victim@example.com'}

        resp = api_client.post('/api/auth/google/', {'token': 'victim-token'}, format='json')

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.data['code'] == 'EMAIL_IN_USE'
        assert 'bp_access' not in resp.cookies
        attacker_made.refresh_from_db()
        assert attacker_made.google_id in (None, '')

    @override_settings(GOOGLE_CLIENT_ID='google-client-id')
    @patch('accounts.views.google_id_token.verify_oauth2_token')
    def test_links_google_to_a_passwordless_account(self, mock_verify, api_client):
        """Accounts created by magic link have no password and proved control of the email."""
        user = UserFactory(email='existing@example.com')
        user.set_unusable_password()
        user.save()
        mock_verify.return_value = {
            **GOOGLE_IDINFO, 'sub': 'google-sub-existing', 'email': 'existing@example.com',
            'picture': 'https://example.com/existing.png',
        }

        resp = api_client.post('/api/auth/google/', {'token': 'existing-token'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.google_id == 'google-sub-existing'
        assert user.avatar == 'https://example.com/existing.png'

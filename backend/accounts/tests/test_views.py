import pytest
from datetime import timedelta
from unittest.mock import patch
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from accounts.models import User, MagicToken
from tests.factories import UserFactory, MagicTokenFactory, WorkspaceFactory


@pytest.fixture
def anon_client():
    return APIClient()


# ── Register Tests ───────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRegister:
    def test_register_success(self, anon_client):
        data = {
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'Str0ngP@ss!',
            'password2': 'Str0ngP@ss!',
        }
        resp = anon_client.post('/api/auth/register/', data, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert 'tokens' not in resp.data
        assert 'bp_access' in resp.cookies and 'bp_refresh' in resp.cookies
        assert resp.data['user']['username'] == 'newuser'

    def test_register_duplicate_username(self, anon_client):
        UserFactory(username='taken')
        data = {
            'username': 'taken',
            'email': 'another@example.com',
            'password': 'Str0ngP@ss!',
            'password2': 'Str0ngP@ss!',
        }
        resp = anon_client.post('/api/auth/register/', data, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_password_mismatch(self, anon_client):
        data = {
            'username': 'mismatch',
            'email': 'mis@example.com',
            'password': 'Str0ngP@ss!',
            'password2': 'Different1!',
        }
        resp = anon_client.post('/api/auth/register/', data, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Login Tests ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLogin:
    def test_login_success(self, anon_client):
        user = UserFactory(username='loginuser')
        # Password set via factory PostGeneration: 'testpass123'
        data = {'username': 'loginuser', 'password': 'testpass123'}
        resp = anon_client.post('/api/auth/login/', data, format='json')
        assert resp.status_code == status.HTTP_200_OK
        # Tokens travel only in httpOnly cookies, never in the body (ADR-008)
        assert 'access' not in resp.data and 'refresh' not in resp.data
        assert resp.cookies['bp_access']['httponly']
        assert resp.cookies['bp_refresh']['httponly']

    def test_login_invalid_credentials(self, anon_client):
        UserFactory(username='loginuser2')
        data = {'username': 'loginuser2', 'password': 'wrongpassword'}
        resp = anon_client.post('/api/auth/login/', data, format='json')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ── Me Tests ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestMe:
    def test_me_authenticated(self, auth_client, user):
        resp = auth_client.get('/api/auth/me/')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['username'] == user.username
        assert resp.data['email'] == user.email

    def test_me_unauthenticated(self, anon_client):
        resp = anon_client.get('/api/auth/me/')
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ── Magic Link Tests ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestMagicLinkRequest:
    def test_request_creates_token(self, anon_client):
        UserFactory(email='magic@example.com')
        resp = anon_client.post(
            '/api/auth/magic/request/',
            {'email': 'magic@example.com'},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        assert MagicToken.objects.filter(email='magic@example.com').exists()

    def test_request_nonexistent_email_still_succeeds(self, anon_client):
        resp = anon_client.post(
            '/api/auth/magic/request/',
            {'email': 'ghost@example.com'},
            format='json',
        )
        # Always returns success to not reveal if email exists
        assert resp.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestMagicLinkVerify:
    def test_verify_valid_token(self, anon_client):
        user = UserFactory(email='verify@example.com')
        token = MagicTokenFactory(email='verify@example.com', token='valid-token-123')

        resp = anon_client.post(
            '/api/auth/magic/verify/',
            {'token': 'valid-token-123'},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        assert 'tokens' not in resp.data
        assert 'bp_access' in resp.cookies
        assert resp.data['user']['email'] == 'verify@example.com'

        # Token should be marked as used
        token.refresh_from_db()
        assert token.used is True

    def test_verify_expired_token(self, anon_client):
        token = MagicTokenFactory(email='expired@example.com', token='expired-token')
        MagicToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(minutes=20)
        )

        resp = anon_client.post(
            '/api/auth/magic/verify/',
            {'token': 'expired-token'},
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_used_token(self, anon_client):
        MagicTokenFactory(email='used@example.com', token='used-token', used=True)

        resp = anon_client.post(
            '/api/auth/magic/verify/',
            {'token': 'used-token'},
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_invalid_token(self, anon_client):
        resp = anon_client.post(
            '/api/auth/magic/verify/',
            {'token': 'nonexistent-token'},
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


# ── Token Refresh Tests ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestTokenRefresh:
    def test_refresh_with_cookie_only_rotates_tokens(self, anon_client):
        UserFactory(username='refreshuser')
        anon_client.post('/api/auth/login/', {'username': 'refreshuser', 'password': 'testpass123'}, format='json')
        old_refresh = anon_client.cookies['bp_refresh'].value

        resp = anon_client.post('/api/auth/refresh/', {}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert 'access' not in resp.data
        assert resp.cookies['bp_refresh'].value != old_refresh

"""Launch review: account security (SEC-005, SEC-007, SEC-008, SEC-010, UX-003, SEC-001 d)."""
from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.cookies import REFRESH_COOKIE
from accounts.models import MagicToken
from pages.models import PageInvite
from tests.factories import PageFactory, UserFactory

pytestmark = pytest.mark.django_db


def login(client, username, password='testpass123'):
    return client.post('/api/auth/login/', {'username': username, 'password': password}, format='json')


class TestLoginBodies:
    @pytest.mark.parametrize('body', ['["a"]', '[]', '"text"', '3'])
    def test_sec_008_a_json_body_that_is_not_an_object_is_a_401_not_a_500(self, body):
        response = APIClient().post('/api/auth/login/', body, content_type='application/json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data['code'] == 'INVALID_CREDENTIALS'


class TestPasswordDisabledHint:
    def test_ux_003_an_account_whose_password_was_turned_off_says_so(self):
        user = UserFactory(username='taken')
        user.set_unusable_password()
        user.save()

        response = login(APIClient(), 'taken', 'the-old-password')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data['code'] == 'PASSWORD_DISABLED'

    def test_ux_003_it_also_answers_to_the_email(self):
        user = UserFactory(username='magic_1', email='magic@example.com')
        user.set_unusable_password()
        user.save()
        assert login(APIClient(), 'Magic@example.com', 'x').data['code'] == 'PASSWORD_DISABLED'

    def test_a_wrong_password_is_still_invalid_credentials(self):
        UserFactory(username='normal')
        assert login(APIClient(), 'normal', 'wrong').data['code'] == 'INVALID_CREDENTIALS'
        assert login(APIClient(), 'nobody', 'wrong').data['code'] == 'INVALID_CREDENTIALS'


def refresh_with(raw_refresh):
    client = APIClient()
    client.cookies[REFRESH_COOKIE] = raw_refresh
    return client.post('/api/auth/refresh/')


class TestRefreshIsSingleUse:
    def test_sec_007_a_token_already_blacklisted_by_a_parallel_refresh_is_refused(self):
        user = UserFactory()
        raw = str(RefreshToken.for_user(user))
        # The race: another request blacklisted it between this one's blacklist check and its rotation
        with patch('rest_framework_simplejwt.tokens.BlacklistMixin.check_blacklist'):
            first = refresh_with(raw)
            second = refresh_with(raw)

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_401_UNAUTHORIZED
        assert second.data['code'] == 'INVALID_REFRESH_TOKEN'

    def test_a_normal_refresh_rotates(self):
        user = UserFactory()
        raw = str(RefreshToken.for_user(user))
        response = refresh_with(raw)
        assert response.status_code == status.HTTP_200_OK
        assert response.cookies[REFRESH_COOKIE].value != raw
        assert BlacklistedToken.objects.filter(token__jti=RefreshToken(raw, verify=False)['jti']).exists()
        # The new one works once more
        assert refresh_with(response.cookies[REFRESH_COOKIE].value).status_code == status.HTTP_200_OK


class TestRateLimitDefaults:
    def test_sec_010_refresh_has_its_own_bucket(self, settings):
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_RATES': {
                **settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'auth': '2/minute', 'refresh': '60/minute',
            },
        }
        user = UserFactory()
        for _ in range(3):
            refresh_with(str(RefreshToken.for_user(user)))
        # Three refreshes from this IP do not count against sign-in
        assert login(APIClient(), user.username).status_code == status.HTTP_200_OK

    def test_sec_010_default_rates(self):
        import config.settings as project_settings
        rates = project_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
        assert rates['guest'] == '20/hour'
        assert rates['refresh'] == '60/minute'
        assert rates['auth'] == '10/minute'


def owner_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class TestInvitesCanBeRevoked:
    def test_sec_005_unshare_also_closes_the_invite_links(self):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        invite = PageInvite.objects.create(page=page, created_by=owner)

        owner_client(owner).post(f'/api/pages/{page.pk}/unshare/', {'user_id': str(collaborator.pk)}, format='json')

        rejoin = owner_client(collaborator).post('/api/auth/join/', {'token': invite.token}, format='json')
        assert rejoin.status_code == status.HTTP_404_NOT_FOUND
        assert not page.collaborators.filter(pk=collaborator.pk).exists()

    def test_sec_005_the_owner_can_revoke_every_link(self):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        PageInvite.objects.create(page=page, created_by=owner)
        PageInvite.objects.create(page=page, created_by=owner)

        response = owner_client(owner).delete(f'/api/pages/{page.pk}/invite/')

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response['X-Revoked-Invites'] == '2'
        assert not PageInvite.objects.filter(page=page).exists()

    def test_only_the_owner_revokes(self):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        PageInvite.objects.create(page=page, created_by=owner)

        response = owner_client(collaborator).delete(f'/api/pages/{page.pk}/invite/')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'NOT_OWNER'
        assert PageInvite.objects.filter(page=page).exists()

    def test_sec_005_a_takeover_closes_the_squatters_invite_links(self):
        squatter = UserFactory(email='victim@example.com', email_verified=False)
        page = PageFactory(owner=squatter)
        invite = PageInvite.objects.create(page=page, created_by=squatter)
        MagicToken.objects.create(email='victim@example.com', token='victim-token')

        APIClient().post('/api/auth/magic/verify/', {'token': 'victim-token'}, format='json')

        accomplice = UserFactory()
        rejoin = owner_client(accomplice).post('/api/auth/join/', {'token': invite.token}, format='json')
        assert rejoin.status_code == status.HTTP_404_NOT_FOUND
        assert not page.collaborators.filter(pk=accomplice.pk).exists()


class TestFullDatabase:
    @pytest.fixture
    def full(self):
        with patch('accounts.capacity.database_size_bytes', return_value=10**12):
            yield

    def test_sec_001_no_new_guests_when_the_database_is_nearly_full(self, full):
        response = APIClient().post('/api/auth/guest/')
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data['code'] == 'SERVICE_FULL'

    def test_sec_001_no_new_sign_ups_either(self, full):
        response = APIClient().post('/api/auth/register/', {
            'username': 'newbie', 'email': 'newbie@example.com',
            'password': 'Sup3r-secret-pw!', 'password2': 'Sup3r-secret-pw!',
        }, format='json')
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_existing_accounts_still_sign_in(self, full):
        UserFactory(username='regular')
        assert login(APIClient(), 'regular').status_code == status.HTTP_200_OK

    def test_below_the_limit_guests_start(self):
        with patch('accounts.capacity.database_size_bytes', return_value=1024):
            assert APIClient().post('/api/auth/guest/').status_code == status.HTTP_201_CREATED

    def test_sqlite_is_never_full(self):
        from accounts.capacity import database_is_full
        assert database_is_full() is False

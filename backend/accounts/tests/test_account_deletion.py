"""DELETE /api/auth/me/: people delete their own account and everything it owns (ADR-028)."""
import json
import logging
from unittest.mock import patch

import pytest
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.cookies import ACCESS_COOKIE, REFRESH_COOKIE
from accounts.guests import create_guest
from accounts.models import User
from analytics.models import AnalyticsEvent
from billing.models import PaymentHistory, Plan, Subscription
from pages.models import Asset, Block, CustomDomain, Page, PageInvite, PageVersion, Workspace
from submissions.models import FormSubmission
from tests.factories import BlockFactory, PageFactory, UserFactory, WorkspaceFactory

URL = '/api/auth/me/'
PASSWORD = 'testpass123'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
URLOPEN = 'pages.revalidation.urllib.request.urlopen'


@pytest.fixture(autouse=True)
def free_plan(db):
    return Plan.objects.create(name='free', display_name='Free', max_pages=3, max_version_history=5)


@pytest.fixture(autouse=True)
def media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def revalidation_on(settings):
    settings.REVALIDATE_SECRET = 'test-secret'
    settings.FRONTEND_URL = 'http://frontend.test/'


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_account(**user_kwargs):
    """A person with a workspace (and its free subscription) and one of everything they can own."""
    user = UserFactory(**user_kwargs)
    workspace = WorkspaceFactory(owner=user)
    page = PageFactory(owner=user, workspace=workspace, slug=f'public-{user.username}')
    BlockFactory(page=page)
    page.publish(user)
    FormSubmission.objects.create(page=page, name='Ana', email='ana@example.com', message='Hola')
    AnalyticsEvent.objects.create(page=page, visitor_id='v1', event_type='pageview')
    PageInvite.objects.create(page=page, created_by=user)
    CustomDomain.objects.create(workspace=workspace, page=page, domain=f'{user.username}.example.com')
    asset = Asset.objects.create(owner=user, workspace=workspace, name='logo.png', mime_type='image/png', size=10)
    asset.file.save('logo.png', ContentFile(PNG))
    RefreshToken.for_user(user)
    return user, page, asset


def count_everything_of(user, page):
    return {
        'users': User.objects.filter(pk=user.pk).count(),
        'workspaces': Workspace.objects.filter(owner=user).count(),
        'subscriptions': Subscription.objects.filter(workspace__owner=user).count(),
        'pages': Page.objects.filter(owner=user).count(),
        'blocks': Block.objects.filter(page=page).count(),
        'versions': PageVersion.objects.filter(page=page).count(),
        'submissions': FormSubmission.objects.filter(page=page).count(),
        'events': AnalyticsEvent.objects.filter(page=page).count(),
        'invites': PageInvite.objects.filter(page=page).count(),
        'domains': CustomDomain.objects.filter(page=page).count(),
        'assets': Asset.objects.filter(owner=user).count(),
        'tokens': OutstandingToken.objects.filter(user=user).count(),
    }


@pytest.mark.django_db
class TestDeleteWithPassword:
    def test_deletes_the_account_and_everything_it_owns(self):
        user, page, asset = make_account()
        stored_path = asset.file.path
        before = count_everything_of(user, page)
        assert all(count > 0 for count in before.values()), before

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert count_everything_of(user, page) == {name: 0 for name in before}
        import os
        assert not os.path.exists(stored_path)

    def test_clears_the_session_cookies(self):
        user, *_ = make_account()

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.cookies[ACCESS_COOKIE].value == ''
        assert resp.cookies[REFRESH_COOKIE].value == ''

    def test_does_not_touch_other_accounts(self):
        user, *_ = make_account()
        other, other_page, _ = make_account()

        client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert all(count > 0 for count in count_everything_of(other, other_page).values())

    def test_a_wrong_password_deletes_nothing(self):
        user, page, _ = make_account()
        before = count_everything_of(user, page)

        resp = client_for(user).delete(URL, {'password': 'not-the-password'}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'INVALID_PASSWORD'
        assert count_everything_of(user, page) == before

    def test_no_password_at_all_deletes_nothing(self):
        user, page, _ = make_account()

        resp = client_for(user).delete(URL, {}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert User.objects.filter(pk=user.pk).exists()

    def test_typing_the_username_is_not_enough_for_an_account_with_a_password(self):
        user, *_ = make_account()

        resp = client_for(user).delete(URL, {'confirm_username': user.username}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert User.objects.filter(pk=user.pk).exists()

    def test_the_deleted_session_can_no_longer_refresh(self):
        user, *_ = make_account()
        client = APIClient()
        login = client.post('/api/auth/login/', {'username': user.username, 'password': PASSWORD}, format='json')
        assert login.status_code == status.HTTP_200_OK

        assert client.delete(URL, {'password': PASSWORD}, format='json').status_code == status.HTTP_204_NO_CONTENT

        assert client.get(URL).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestDeleteWithoutPassword:
    def test_needs_the_username_typed_exactly(self):
        user, page, _ = make_account()
        user.set_unusable_password()
        user.save()

        wrong = client_for(user).delete(URL, {'confirm_username': user.username.upper()}, format='json')
        missing = client_for(user).delete(URL, {}, format='json')

        assert wrong.status_code == missing.status_code == status.HTTP_400_BAD_REQUEST
        assert wrong.data['code'] == 'CONFIRMATION_MISMATCH'
        assert User.objects.filter(pk=user.pk).exists()

    def test_deletes_with_the_right_username(self):
        user, page, _ = make_account()
        user.set_unusable_password()
        user.save()

        resp = client_for(user).delete(URL, {'confirm_username': user.username}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not User.objects.filter(pk=user.pk).exists()
        assert not Page.objects.filter(pk=page.pk).exists()

    def test_a_blank_password_does_not_pass(self):
        user, *_ = make_account()
        user.set_unusable_password()
        user.save()

        resp = client_for(user).delete(URL, {'password': ''}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestProfileTellsHowToConfirm:
    def test_has_password_is_true_for_accounts_with_a_password(self):
        user = UserFactory()

        assert client_for(user).get(URL).data['has_password'] is True

    def test_has_password_is_false_for_magic_link_and_google_accounts(self):
        user = UserFactory()
        user.set_unusable_password()
        user.save()

        assert client_for(user).get(URL).data['has_password'] is False


@pytest.mark.django_db
class TestWhoCanDelete:
    def test_anonymous_requests_are_refused(self):
        resp = APIClient().delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_guests_cannot(self):
        guest = create_guest()

        resp = client_for(guest).delete(URL, {'confirm_username': guest.username}, format='json')

        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'GUEST_NOT_ALLOWED'
        assert User.objects.filter(pk=guest.pk).exists()

    def test_it_only_ever_deletes_the_requesting_user(self):
        user, *_ = make_account()
        other, *_ = make_account()

        client_for(user).delete(URL, {'password': PASSWORD, 'user': str(other.pk), 'id': str(other.pk)}, format='json')

        assert User.objects.filter(pk=other.pk).exists()


@pytest.mark.django_db
class TestPublishedPages:
    def test_the_cached_copies_of_published_pages_are_dropped(self, revalidation_on, django_capture_on_commit_callbacks):
        user, page, _ = make_account()
        draft = PageFactory(owner=user, slug='just-a-draft')

        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        [request] = [call.args[0] for call in urlopen.call_args_list]
        assert json.loads(request.data) == {'slugs': [page.slug]}
        assert draft.slug not in request.data.decode()

    def test_pages_shared_with_the_user_stay_for_their_owner(self):
        user, *_ = make_account()
        owner = UserFactory()
        shared = PageFactory(owner=owner)
        shared.collaborators.add(user)

        client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        shared.refresh_from_db()
        assert shared.collaborators.count() == 0

    def test_the_public_api_stops_serving_the_page(self):
        user, page, _ = make_account()
        public_url = f'/api/public/pages/{page.slug}/'
        assert APIClient().get(public_url).status_code == status.HTTP_200_OK

        client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert APIClient().get(public_url).status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestPaidSubscription:
    def pay(self, user, **fields):
        subscription = Subscription.objects.get(workspace__owner=user)
        pro = Plan.objects.create(name='pro', display_name='Pro', price_monthly=19, max_pages=-1)
        defaults = {
            'plan': pro, 'status': Subscription.Status.ACTIVE,
            'stripe_customer_id': 'cus_test', 'stripe_subscription_id': 'sub_test',
        }
        for name, value in {**defaults, **fields}.items():
            setattr(subscription, name, value)
        subscription.save()
        return subscription

    @pytest.fixture(autouse=True)
    def no_stripe(self):
        with patch('billing.views._get_stripe') as get_stripe, patch('stripe.Subscription.cancel') as cancel:
            self.get_stripe, self.cancel = get_stripe, cancel
            yield

    def test_an_active_subscription_blocks_the_deletion_with_409(self):
        user, page, _ = make_account()
        self.pay(user)
        before = count_everything_of(user, page)

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.data['code'] == 'ACTIVE_SUBSCRIPTION'
        assert resp.data['error']
        assert count_everything_of(user, page) == before
        self.get_stripe.assert_not_called()
        self.cancel.assert_not_called()

    @pytest.mark.parametrize('stripe_status', [Subscription.Status.TRIALING, Subscription.Status.PAST_DUE])
    def test_other_states_that_still_charge_block_too(self, stripe_status):
        user, *_ = make_account()
        self.pay(user, status=stripe_status)

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_a_subscription_that_ends_by_itself_does_not_block(self):
        user, *_ = make_account()
        self.pay(user, cancel_at_period_end=True)

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.parametrize('fields', [
        {'status': Subscription.Status.CANCELED},
        {'status': Subscription.Status.FREE, 'stripe_subscription_id': None},
        {'stripe_subscription_id': ''},
    ])
    def test_nothing_to_cancel_does_not_block(self, fields):
        user, *_ = make_account()
        self.pay(user, **fields)

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not PaymentHistory.objects.filter(subscription__workspace__owner=user).exists()

    def test_a_free_account_is_deleted_without_asking_stripe(self):
        user, *_ = make_account()

        resp = client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        self.get_stripe.assert_not_called()
        self.cancel.assert_not_called()

    def test_the_password_is_checked_before_saying_anything_about_the_subscription(self):
        user, *_ = make_account()
        self.pay(user)

        resp = client_for(user).delete(URL, {'password': 'wrong'}, format='json')

        assert resp.data['code'] == 'INVALID_PASSWORD'


@pytest.mark.django_db
class TestLogging:
    def test_the_log_has_counts_and_nothing_that_identifies_the_person(self, caplog):
        user, *_ = make_account(username='lucia-secreta', email='lucia@secreta.example')
        user_id = str(user.pk)
        caplog.set_level(logging.DEBUG)

        client_for(user).delete(URL, {'password': PASSWORD}, format='json')

        logged = ' '.join(f'{record.getMessage()} {record.__dict__}' for record in caplog.records)
        assert 'Account deleted' in logged
        for personal in ('lucia-secreta', 'lucia@secreta.example', user_id):
            assert personal not in logged


@pytest.mark.django_db
class TestRateLimit:
    def test_wrong_passwords_are_throttled_like_a_login(self, settings):
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'auth': '3/minute'},
        }
        user, *_ = make_account()
        client = client_for(user)

        codes = [client.delete(URL, {'password': 'wrong'}, format='json').status_code for _ in range(4)]

        assert codes[:3] == [status.HTTP_400_BAD_REQUEST] * 3
        assert codes[3] == status.HTTP_429_TOO_MANY_REQUESTS
        assert User.objects.filter(pk=user.pk).exists()

    def test_reading_the_profile_is_not_throttled_by_it(self, settings):
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'auth': '1/minute'},
        }
        user, *_ = make_account()
        client = client_for(user)

        assert [client.get(URL).status_code for _ in range(3)] == [status.HTTP_200_OK] * 3

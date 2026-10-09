"""Invite links: POST /api/pages/{id}/invite/ and POST /api/auth/join/ (ADR-024)."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.guests import create_guest
from accounts.views import JoinView
from billing.models import Plan
from pages.models import Page, PageInvite
from tests.factories import PageFactory, UserFactory

User = get_user_model()
JOIN_URL = '/api/auth/join/'

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def plans():
    Plan.objects.create(name='free', display_name='Free', max_pages=3)
    Plan.objects.create(name='pro', display_name='Pro', max_pages=-1, has_collaboration=True, max_version_history=-1)


@pytest.fixture
def real_guest_rate(settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'guest': '2/hour'},
    }


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def invite_for(page, **fields):
    return PageInvite.objects.create(page=page, created_by=page.owner, **fields)


def join(client, token):
    return client.post(JOIN_URL, {'token': token}, format='json')


class TestCreatingInvites:
    def test_the_owner_gets_a_link_valid_for_a_day_and_five_uses(self, auth_client, page):
        resp = auth_client.post(f'/api/pages/{page.id}/invite/')

        assert resp.status_code == status.HTTP_201_CREATED
        invite = PageInvite.objects.get(page=page)
        assert resp.data['token'] == invite.token
        assert resp.data['path'] == f'/join/{invite.token}'
        assert len(invite.token) >= 32
        assert (invite.max_uses, invite.uses, invite.created_by) == (5, 0, page.owner)
        assert timedelta(hours=23, minutes=59) < invite.expires_at - timezone.now() <= timedelta(hours=24)
        assert resp.data['expires_at'] == invite.expires_at.isoformat()

    def test_a_guest_owner_can_invite(self):
        guest = create_guest()
        page = PageFactory(owner=guest)
        resp = client_for(guest).post(f'/api/pages/{page.id}/invite/')
        assert resp.status_code == status.HTTP_201_CREATED

    def test_a_new_link_does_not_invalidate_the_old_one(self, auth_client, page):
        first = auth_client.post(f'/api/pages/{page.id}/invite/').data['token']
        second = auth_client.post(f'/api/pages/{page.id}/invite/').data['token']
        assert first != second
        assert join(APIClient(), first).status_code == status.HTTP_201_CREATED
        assert join(APIClient(), second).status_code == status.HTTP_201_CREATED

    def test_expired_links_are_swept_when_a_new_one_is_made(self, auth_client, page):
        old = invite_for(page, expires_at=timezone.now() - timedelta(minutes=1))
        auth_client.post(f'/api/pages/{page.id}/invite/')
        assert not PageInvite.objects.filter(pk=old.pk).exists()

    def test_a_collaborator_cannot_invite(self, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        resp = client_for(collaborator).post(f'/api/pages/{page.id}/invite/')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'NOT_OWNER'
        assert not PageInvite.objects.exists()

    def test_a_stranger_does_not_even_see_the_page(self, page):
        resp = client_for(UserFactory()).post(f'/api/pages/{page.id}/invite/')
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_anonymous_cannot_invite(self, page):
        resp = APIClient().post(f'/api/pages/{page.id}/invite/')
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_deleting_the_page_deletes_its_invites(self, auth_client, page):
        invite_for(page)
        page.delete()
        assert not PageInvite.objects.exists()


class TestJoining:
    def test_an_anonymous_visitor_becomes_a_guest_collaborator_with_a_session(self, page):
        invite = invite_for(page)
        client = APIClient()

        resp = join(client, invite.token)

        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['page_id'] == str(page.id)
        guest = User.objects.get(pk=resp.data['user']['id'])
        assert guest.is_guest
        assert resp.data['user']['username'] == guest.username
        assert page.collaborators.filter(pk=guest.pk).exists()
        assert 'bp_access' in resp.cookies and 'bp_refresh' in resp.cookies
        assert 'access' not in resp.data and 'refresh' not in resp.data
        invite.refresh_from_db()
        assert invite.uses == 1
        # The cookies work: the new guest can open the page
        assert client.get(f'/api/pages/{page.id}/').status_code == status.HTTP_200_OK

    def test_the_new_guest_gets_a_pro_workspace_like_any_guest(self, page):
        invite = invite_for(page)
        resp = join(APIClient(), invite.token)
        guest = User.objects.get(pk=resp.data['user']['id'])
        assert guest.workspaces.get().subscription.plan.name == 'pro'

    def test_a_signed_in_user_becomes_a_collaborator_without_a_new_account(self, page):
        invite = invite_for(page)
        visitor = UserFactory()
        users_before = User.objects.count()

        resp = join(client_for(visitor), invite.token)

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['page_id'] == str(page.id)
        assert resp.data['user']['id'] == str(visitor.pk)
        assert User.objects.count() == users_before
        assert page.collaborators.filter(pk=visitor.pk).exists()
        assert 'bp_access' not in resp.cookies
        invite.refresh_from_db()
        assert invite.uses == 1

    def test_joining_twice_does_not_use_up_the_link(self, page):
        invite = invite_for(page)
        visitor = UserFactory()
        join(client_for(visitor), invite.token)
        join(client_for(visitor), invite.token)
        invite.refresh_from_db()
        assert invite.uses == 1
        assert page.collaborators.count() == 1

    def test_the_owner_just_gets_the_page_back(self, auth_client, page, user):
        invite = invite_for(page)

        resp = join(auth_client, invite.token)

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['page_id'] == str(page.id)
        assert not page.collaborators.exists()
        invite.refresh_from_db()
        assert invite.uses == 0

    def test_a_joined_user_can_edit_but_not_publish_share_or_invite(self, page):
        invite = invite_for(page)
        client = APIClient()
        join(client, invite.token)

        assert client.put(f'/api/pages/{page.id}/', {'name': 'Editado', 'blocks': [], 'version': 1},
                          format='json').status_code == status.HTTP_200_OK
        assert client.delete(f'/api/pages/{page.id}/').status_code == status.HTTP_403_FORBIDDEN
        assert client.post(f'/api/pages/{page.id}/invite/').status_code == status.HTTP_403_FORBIDDEN
        assert Page.objects.filter(pk=page.pk).exists()

    @pytest.mark.parametrize('body', [{}, {'token': ''}, {'token': 123}, {'token': None}, {'token': 'x' * 500}, {'token': 'nope'}])
    def test_unknown_or_malformed_tokens_are_all_the_same_404(self, body):
        resp = APIClient().post(JOIN_URL, body, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'INVITE_INVALID'

    def test_expired_used_up_and_unknown_look_identical(self, page):
        expired = invite_for(page, expires_at=timezone.now() - timedelta(seconds=1))
        used_up = invite_for(page, uses=5)
        answers = []
        for token in (expired.token, used_up.token, 'unknown'):
            resp = join(APIClient(), token)
            answers.append((resp.status_code, dict(resp.data)))
        assert answers[0] == answers[1] == answers[2]
        assert answers[0][0] == status.HTTP_404_NOT_FOUND
        assert not page.collaborators.exists()
        assert User.objects.filter(is_guest=True).count() == 0

    def test_expired_and_used_up_links_are_refused_for_signed_in_users_too(self, page):
        expired = invite_for(page, expires_at=timezone.now() - timedelta(seconds=1))
        used_up = invite_for(page, uses=5)
        visitor = UserFactory()
        for invite in (expired, used_up):
            assert join(client_for(visitor), invite.token).status_code == status.HTTP_404_NOT_FOUND
        assert not page.collaborators.exists()

    def test_the_sixth_person_is_refused(self, page):
        invite = invite_for(page)
        for _ in range(5):
            assert join(APIClient(), invite.token).status_code == status.HTTP_201_CREATED
        assert join(APIClient(), invite.token).status_code == status.HTTP_404_NOT_FOUND
        invite.refresh_from_db()
        assert invite.uses == 5
        assert page.collaborators.count() == 5

    def test_taking_the_last_use_is_atomic(self, page):
        """Two joins both saw a free use; the conditional update lets only one through
        and the loser creates no guest."""
        invite = invite_for(page, uses=4)
        guests_before = User.objects.filter(is_guest=True).count()
        stale = PageInvite.objects.get(pk=invite.pk)

        # The loser passed the "is it open" check on a copy read before the other join landed
        PageInvite.objects.filter(pk=invite.pk).update(uses=5)
        with patch.object(JoinView, '_is_open', return_value=True), \
                patch('pages.models.PageInvite.objects.select_related') as select_related:
            select_related.return_value.filter.return_value.first.return_value = stale
            resp = join(APIClient(), invite.token)

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert User.objects.filter(is_guest=True).count() == guests_before
        assert PageInvite.objects.get(pk=invite.pk).uses == 5
        assert not page.collaborators.exists()

    def test_anonymous_joins_share_the_guest_creation_throttle(self, page, real_guest_rate):
        invite = invite_for(page)
        assert join(APIClient(), invite.token).status_code == status.HTTP_201_CREATED
        assert join(APIClient(), invite.token).status_code == status.HTTP_201_CREATED
        resp = join(APIClient(), invite.token)
        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        invite.refresh_from_db()
        assert invite.uses == 2

    def test_a_throttled_join_does_not_throttle_signed_in_users(self, page, real_guest_rate):
        invite = invite_for(page)
        for _ in range(2):
            join(APIClient(), invite.token)
        assert join(APIClient(), invite.token).status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert join(client_for(UserFactory()), invite.token).status_code == status.HTTP_200_OK

    def test_the_guest_creation_limits_apply_and_do_not_burn_a_use(self, page, settings):
        settings.GUEST_MAX_ACTIVE = 0
        invite = invite_for(page)

        resp = join(APIClient(), invite.token)

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert resp.data['code'] == 'GUEST_CAPACITY'
        invite.refresh_from_db()
        assert invite.uses == 0

    def test_get_is_not_allowed(self):
        assert APIClient().get(JOIN_URL).status_code == status.HTTP_405_METHOD_NOT_ALLOWED

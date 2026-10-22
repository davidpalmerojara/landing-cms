"""Launch review: sockets that outlive their session or crash without cleanup.

DATA-006: a non-string `type` (or any failing handler) closed the socket with
1011 without running disconnect, leaving a ghost participant and its locks.
DATA-007: the socket stayed authorized after logout or session revocation.
DATA-009: deleting an account did not tell the editors of its pages.
"""
from unittest.mock import patch

import pytest
from asgiref.sync import sync_to_async
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.cookies import REFRESH_COOKIE
from accounts.deletion import delete_account
from billing.models import Plan, Subscription
from collaboration.consumers import CLOSE_SESSION_ENDED, PageConsumer
from pages.models import Workspace
from tests.factories import BlockFactory, PageFactory, UserFactory

from .helpers import TIMEOUT, async_test, next_message, open_socket

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def plans(db):
    Plan.objects.create(name='free', display_name='Free', max_pages=3)
    Plan.objects.create(name='pro', display_name='Pro', max_pages=-1, has_collaboration=True, max_version_history=-1)


def make_pro_user():
    user = UserFactory()
    workspace = Workspace.objects.create(owner=user, name='ws')
    Subscription.objects.update_or_create(
        workspace=workspace, defaults={'plan': Plan.objects.get(name='pro'), 'status': 'active'},
    )
    return user


@pytest.fixture
def owner():
    return make_pro_user()


@pytest.fixture
def page(owner):
    return PageFactory(owner=owner)


@pytest.fixture
def collaborator(page):
    user = UserFactory()
    page.collaborators.add(user)
    return user


async def closed_with(communicator):
    """The close code the server sent, skipping any message before it."""
    while True:
        output = await communicator.receive_output(timeout=TIMEOUT)
        if output['type'] == 'websocket.close':
            return output.get('code')


def logout(user):
    client = APIClient()
    client.cookies[REFRESH_COOKIE] = str(RefreshToken.for_user(user))
    return client.post('/api/auth/logout/')


class TestMalformedMessagesKeepTheSocket:
    @async_test
    async def test_data_006_a_dict_as_type_is_refused_and_the_socket_stays(self, page, owner):
        async with open_socket(page.pk, owner) as (socket, _):
            await socket.send_json_to({'type': {'a': 1}})
            error = await next_message(socket, 'error')
            assert error['code'] == 'invalid_message'

            await socket.send_json_to({'type': 'ping'})
            assert (await next_message(socket, 'pong'))['type'] == 'pong'

    @async_test
    async def test_data_006_a_failing_handler_answers_an_error_instead_of_crashing(self, page, owner):
        block = await sync_to_async(BlockFactory)(page=page, type='hero')
        async with open_socket(page.pk, owner) as (socket, _):
            with patch('collaboration.consumers.get_block_type', side_effect=RuntimeError('boom')):
                await socket.send_json_to({'type': 'lock_acquire', 'block_id': str(block.pk)})
                error = await next_message(socket, 'error')
            assert error['code'] == 'server_error'

            await socket.send_json_to({'type': 'ping'})
            assert (await next_message(socket, 'pong'))['type'] == 'pong'

    @async_test
    async def test_data_006_the_other_participant_is_told_when_it_leaves(self, page, owner, collaborator):
        async with open_socket(page.pk, owner) as (owner_socket, _):
            async with open_socket(page.pk, collaborator) as (socket, _):
                await next_message(owner_socket, 'user_joined')
                await socket.send_json_to({'type': {'a': 1}})
                await next_message(socket, 'error')
            left = await next_message(owner_socket, 'user_left')
            assert left['user_id'] == str(collaborator.pk)


class TestSocketsFollowTheSession:
    @async_test
    async def test_data_007_logout_closes_the_users_sockets(self, page, owner):
        async with open_socket(page.pk, owner) as (socket, _):
            response = await sync_to_async(logout)(owner)
            assert response.status_code == 200
            # Not a final code: a browser that still has a session reconnects with a new ticket
            assert await closed_with(socket) == CLOSE_SESSION_ENDED

    @async_test
    async def test_data_007_logout_leaves_other_peoples_sockets_alone(self, page, owner, collaborator):
        async with open_socket(page.pk, owner) as (owner_socket, _):
            async with open_socket(page.pk, collaborator) as (socket, _):
                await sync_to_async(logout)(collaborator)
                assert await closed_with(socket) == CLOSE_SESSION_ENDED
            await owner_socket.send_json_to({'type': 'ping'})
            assert (await next_message(owner_socket, 'pong'))['type'] == 'pong'

    @async_test
    async def test_data_007_a_ping_after_the_sessions_were_revoked_closes_the_socket(self, page, owner):
        async with open_socket(page.pk, owner) as (socket, _):
            # Revoked behind the socket's back (no broadcast), e.g. by another process
            await sync_to_async(type(owner).objects.filter(pk=owner.pk).update)(
                sessions_revoked_at=timezone.now() + timezone.timedelta(seconds=1),
            )
            with patch('collaboration.consumers.SESSION_RECHECK_SECONDS', 0):
                await socket.send_json_to({'type': 'ping'})
                assert await closed_with(socket) == CLOSE_SESSION_ENDED

    @async_test
    async def test_a_ping_with_a_valid_session_still_answers(self, page, owner):
        async with open_socket(page.pk, owner) as (socket, _):
            with patch('collaboration.consumers.SESSION_RECHECK_SECONDS', 0):
                await socket.send_json_to({'type': 'ping'})
                assert (await next_message(socket, 'pong'))['type'] == 'pong'


class TestAccountDeletionTellsTheEditors:
    @async_test
    async def test_data_009_collaborators_hear_that_the_page_is_gone(self, page, owner, collaborator):
        async with open_socket(page.pk, collaborator) as (socket, _):
            await sync_to_async(delete_account)(owner)
            error = await next_message(socket, 'error')
            assert error['code'] == 'page_deleted'


def test_the_consumer_keeps_a_handler_for_session_ended():
    # Channels turns the 'session.ended' event into a call to this method
    assert callable(getattr(PageConsumer, 'session_ended', None))

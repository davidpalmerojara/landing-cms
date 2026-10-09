"""End-to-end tests of PageConsumer over real (in-memory) WebSockets."""
import json
from unittest.mock import patch

import pytest
from asgiref.sync import sync_to_async
from channels.layers import InMemoryChannelLayer
from rest_framework.test import APIClient

from billing.models import Plan, Subscription
from collaboration.locks import get_lock_manager
from pages.models import Page, PageVersion, Workspace
from tests.factories import BlockFactory, PageFactory, UserFactory

from .helpers import (
    TIMEOUT, assert_silent, async_test, collect, new_communicator, next_message, open_socket,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def plans(db):
    free = Plan.objects.create(name='free', display_name='Free', max_pages=3)
    pro = Plan.objects.create(name='pro', display_name='Pro', max_pages=-1, has_collaboration=True,
                              max_version_history=-1)
    return free, pro


def make_user(plan_name='pro'):
    user = UserFactory()
    workspace = Workspace.objects.create(owner=user, name='ws')
    Subscription.objects.update_or_create(
        workspace=workspace,
        defaults={'plan': Plan.objects.get(name=plan_name), 'status': 'active' if plan_name == 'pro' else 'free'},
    )
    return user


@pytest.fixture
def owner():
    return make_user('pro')


@pytest.fixture
def page(owner):
    return PageFactory(owner=owner)


@pytest.fixture
def block(page):
    return BlockFactory(page=page, type='hero', data={'title': 'Hola', 'subtitle': 'Mundo'})


@pytest.fixture
def collaborator(page):
    user = make_user('free')  # the owner's plan is what counts
    page.collaborators.add(user)
    return user


def api_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


async def rest(method, user, url, body=None, **extra):
    client = api_client(user)
    kwargs = {'format': 'json', **extra} if body is not None else dict(extra)
    return await sync_to_async(getattr(client, method))(url, *([body] if body is not None else []), **kwargs)


# ─── Who can connect ────────────────────────────────────────


class TestConnecting:
    @async_test
    async def test_owner_connects_with_a_ticket(self, owner, page):
        async with open_socket(page.id, owner) as (_, connected):
            assert connected['type'] == 'connected'
            assert connected['users'] == [
                {'connection_id': connected['connection_id'], 'user_id': str(owner.pk), 'username': owner.username},
            ]
            assert connected['locks'] == {}
            assert connected['version'] == page.version == 1

    @async_test
    async def test_collaborator_connects_with_the_session_cookie(self, collaborator, page):
        async with open_socket(page.id, collaborator, via='cookie') as (_, connected):
            assert connected['users'][0]['user_id'] == str(collaborator.pk)

    @async_test
    async def test_anonymous_is_refused(self, page):
        communicator = new_communicator(page.id)
        assert await communicator.connect() == (False, 4001)

    @async_test
    async def test_expired_guest_is_refused_with_ticket_and_cookie(self, owner, page):
        """Same rule as HTTP: a guest past 24 h has no session, even before the sweep."""
        from datetime import timedelta
        from django.utils import timezone
        from accounts.models import User

        def expired_guest_collaborator():
            guest = make_user('pro')
            User.objects.filter(pk=guest.pk).update(is_guest=True, created_at=timezone.now() - timedelta(hours=25))
            page.collaborators.add(guest)
            return User.objects.get(pk=guest.pk)

        guest = await sync_to_async(expired_guest_collaborator)()
        for via in ('ticket', 'cookie'):
            communicator = new_communicator(page.id, guest, via=via)
            assert await communicator.connect() == (False, 4001), via

    @async_test
    async def test_a_ticket_works_once(self, owner, page):
        first = new_communicator(page.id, owner)
        # Same URL again: the ticket was consumed by the first handshake
        reused = new_communicator(page.id)
        reused.scope['query_string'] = first.scope['query_string']
        try:
            assert (await first.connect())[0] is True
            assert await reused.connect() == (False, 4001)
        finally:
            await first.disconnect()

    @async_test
    async def test_user_who_is_not_a_collaborator_is_refused_and_nobody_hears_of_it(self, owner, page):
        stranger = await sync_to_async(make_user)('pro')
        async with open_socket(page.id, owner) as (watcher, _):
            refused = new_communicator(page.id, stranger)
            assert await refused.connect() == (False, 4003)
            await assert_silent(watcher)

    @async_test
    async def test_unknown_or_malformed_page_is_refused(self, owner):
        assert await new_communicator('not-a-uuid', owner).connect() == (False, 4003)
        assert await new_communicator('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', owner).connect() == (False, 4003)

    @async_test
    async def test_owner_without_the_collaboration_plan_is_told_and_nobody_hears_of_it(self, page):
        free_owner = await sync_to_async(make_user)('free')
        free_page = await sync_to_async(PageFactory)(owner=free_owner)
        communicator = new_communicator(free_page.id, free_owner)
        assert (await communicator.connect())[0] is True
        error = await communicator.receive_json_from(timeout=TIMEOUT)
        assert error['type'] == 'error' and error['code'] == 'plan_limit'
        assert (await communicator.receive_output(timeout=TIMEOUT))['type'] == 'websocket.close'

    @async_test
    async def test_the_owners_plan_counts_not_the_collaborators(self):
        # A Pro collaborator on a Free owner's page: no collaboration
        free_owner = await sync_to_async(make_user)('free')
        pro_user = await sync_to_async(make_user)('pro')
        free_page = await sync_to_async(PageFactory)(owner=free_owner)
        await sync_to_async(free_page.collaborators.add)(pro_user)
        communicator = new_communicator(free_page.id, pro_user)
        assert (await communicator.connect())[0] is True
        error = await communicator.receive_json_from(timeout=TIMEOUT)
        assert error['code'] == 'plan_limit'

    @async_test
    async def test_a_refused_connection_does_not_break_the_page(self, owner, page):
        """Regression: a refused socket used to broadcast user_left from disconnect()."""
        async with open_socket(page.id, owner) as (watcher, _):
            stranger = await sync_to_async(make_user)('pro')
            communicator = new_communicator(page.id, stranger)
            await communicator.connect()
            await communicator.disconnect()
            await assert_silent(watcher)


# ─── Presence ───────────────────────────────────────────────


class TestPresence:
    @async_test
    async def test_joining_and_leaving_are_announced_per_connection(self, owner, collaborator, page):
        async with open_socket(page.id, owner) as (first, first_connected):
            async with open_socket(page.id, collaborator) as (_, second_connected):
                joined = await next_message(first, 'user_joined')
                assert joined == {
                    'type': 'user_joined',
                    'connection_id': second_connected['connection_id'],
                    'user_id': str(collaborator.pk),
                    'username': collaborator.username,
                }
                assert {u['connection_id'] for u in second_connected['users']} == {
                    first_connected['connection_id'], second_connected['connection_id'],
                }
            left = await next_message(first, 'user_left')
            assert left['connection_id'] == second_connected['connection_id']
            assert left['user_id'] == str(collaborator.pk)

    @async_test
    async def test_two_tabs_of_one_user_are_two_participants(self, owner, page):
        async with open_socket(page.id, owner) as (_, tab1):
            async with open_socket(page.id, owner) as (_, tab2):
                assert tab1['connection_id'] != tab2['connection_id']
                assert [u['user_id'] for u in tab2['users']] == [str(owner.pk)] * 2

    @async_test
    async def test_closing_one_tab_keeps_the_other_tabs_presence_and_locks(self, owner, collaborator, block, page):
        async with open_socket(page.id, owner) as (tab1, tab1_connected):
            tab2 = new_communicator(page.id, owner)
            assert (await tab2.connect())[0] is True
            tab2_connected = await tab2.receive_json_from(timeout=TIMEOUT)
            await next_message(tab1, 'user_joined')

            # Both tabs hold a lock each
            other_block = await sync_to_async(BlockFactory)(page=page, type='cta')
            await tab1.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
            await next_message(tab1, 'lock_acquired')
            await tab2.send_json_to({'type': 'lock_acquire', 'block_id': str(other_block.id)})
            await next_message(tab2, 'lock_acquired')
            await next_message(tab1, 'lock_acquired')

            await tab2.disconnect()  # closing tab 2

            released = await next_message(tab1, 'lock_released')
            assert released['block_id'] == str(other_block.id)
            assert released['connection_id'] == tab2_connected['connection_id']
            left = await next_message(tab1, 'user_left')
            assert left['connection_id'] == tab2_connected['connection_id']

            # A newcomer still sees tab 1 and its lock, but not tab 2 or its lock
            async with open_socket(page.id, collaborator) as (_, newcomer):
                assert [u['connection_id'] for u in newcomer['users'] if u['user_id'] == str(owner.pk)] == [
                    tab1_connected['connection_id'],
                ]
                assert list(newcomer['locks']) == [str(block.id)]
                assert newcomer['locks'][str(block.id)]['connection_id'] == tab1_connected['connection_id']
                assert newcomer['locks'][str(block.id)]['username'] == owner.username

    @async_test
    async def test_disconnect_survives_a_failing_channel_layer(self, owner, block, page):
        async with open_socket(page.id, owner) as (communicator, _):
            await communicator.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
            await next_message(communicator, 'lock_acquired')

            async def broken(self, *args, **kwargs):
                raise ConnectionError('channel layer down')

            with patch.object(InMemoryChannelLayer, 'group_send', broken):
                await communicator.disconnect()  # raises if disconnect() lets it escape

        assert get_lock_manager().get_lock_holder(str(page.id), str(block.id)) is None


# ─── Locks ──────────────────────────────────────────────────


class TestLocks:
    @async_test
    async def test_a_lock_is_exclusive_across_connections_even_of_the_same_user(self, owner, block, page):
        async with open_socket(page.id, owner) as (tab1, tab1_connected):
            async with open_socket(page.id, owner) as (tab2, _):
                await tab1.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                acquired = await next_message(tab1, 'lock_acquired')
                assert acquired['connection_id'] == tab1_connected['connection_id']
                assert (await next_message(tab2, 'lock_acquired'))['block_id'] == str(block.id)

                await tab2.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                rejected = await next_message(tab2, 'lock_rejected')
                assert rejected['block_id'] == str(block.id)
                assert rejected['holder']['connection_id'] == tab1_connected['connection_id']
                assert rejected['holder']['username'] == owner.username

                await tab1.send_json_to({'type': 'lock_release', 'block_id': str(block.id)})
                assert (await next_message(tab2, 'lock_released'))['connection_id'] == tab1_connected['connection_id']
                await tab2.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                assert (await next_message(tab2, 'lock_acquired'))['block_id'] == str(block.id)

    @async_test
    async def test_only_the_holder_can_release_a_lock(self, owner, collaborator, block, page):
        async with open_socket(page.id, owner) as (holder, _):
            async with open_socket(page.id, collaborator) as (other, _):
                await holder.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                await next_message(other, 'lock_acquired')
                await collect(holder)

                await other.send_json_to({'type': 'lock_release', 'block_id': str(block.id)})
                await assert_silent(holder)
                assert get_lock_manager().get_lock_holder(str(page.id), str(block.id)) is not None

    @async_test
    async def test_a_block_of_another_page_cannot_be_locked(self, owner, page):
        foreign = await sync_to_async(BlockFactory)(page=await sync_to_async(PageFactory)(owner=owner))
        async with open_socket(page.id, owner) as (communicator, _):
            await communicator.send_json_to({'type': 'lock_acquire', 'block_id': str(foreign.id)})
            error = await next_message(communicator, 'error')
            assert error['code'] == 'block_not_found'
            await communicator.send_json_to({'type': 'lock_acquire', 'block_id': 'not-a-uuid'})
            assert (await next_message(communicator, 'error'))['code'] == 'block_not_found'
        assert get_lock_manager().get_lock_holder(str(page.id), str(foreign.id)) is None
        assert get_lock_manager().get_lock_holder(str(foreign.page_id), str(foreign.id)) is None

    @async_test
    async def test_renewing_a_lock_you_do_not_hold_says_it_is_released(self, owner, block, page):
        async with open_socket(page.id, owner) as (communicator, connected):
            await communicator.send_json_to({'type': 'lock_renew', 'block_id': str(block.id)})
            released = await next_message(communicator, 'lock_released')
            assert released['block_id'] == str(block.id)
            assert released['connection_id'] == connected['connection_id']


# ─── Live edits and cursors ─────────────────────────────────


class TestLiveRelay:
    @async_test
    async def test_block_updated_is_relayed_only_from_the_lock_holder(self, owner, collaborator, block, page):
        async with open_socket(page.id, owner) as (holder, holder_connected):
            async with open_socket(page.id, collaborator) as (other, _):
                await holder.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                await next_message(other, 'lock_acquired')
                await collect(holder)

                # Not the holder: refused, nothing reaches anyone
                await other.send_json_to({'type': 'block_updated', 'block_id': str(block.id), 'data': {'title': 'Hack'}})
                assert (await next_message(other, 'error'))['code'] == 'lock_required'
                await assert_silent(holder)

                # The holder: relayed to the others, not echoed back
                await holder.send_json_to({'type': 'block_updated', 'block_id': str(block.id), 'data': {'title': 'Nuevo'}})
                relayed = await next_message(other, 'block_updated')
                assert relayed['block_id'] == str(block.id)
                assert relayed['connection_id'] == holder_connected['connection_id']
                assert relayed['user_id'] == str(owner.pk)
                await assert_silent(holder)

    @async_test
    async def test_the_relayed_data_is_what_was_sent_not_a_merge_with_the_stored_block(self, owner, collaborator, block, page):
        """Receivers replace the block's data with this; the server must not add the stored keys back."""
        async with open_socket(page.id, owner) as (holder, _):
            async with open_socket(page.id, collaborator) as (other, _):
                await holder.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                await next_message(other, 'lock_acquired')
                await holder.send_json_to({'type': 'block_updated', 'block_id': str(block.id), 'data': {'title': 'Solo titulo'}})
                relayed = await next_message(other, 'block_updated')
                assert relayed['data'] == {'title': 'Solo titulo'}  # 'subtitle' stored on the block is not added

    @async_test
    async def test_unsafe_data_is_not_relayed(self, owner, collaborator, block, page):
        async with open_socket(page.id, owner) as (holder, _):
            async with open_socket(page.id, collaborator) as (other, _):
                await holder.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
                await next_message(other, 'lock_acquired')
                await holder.send_json_to({
                    'type': 'block_updated', 'block_id': str(block.id), 'data': {'buttonLink': 'javascript:alert(1)'},
                })
                assert (await next_message(holder, 'error'))['code'] == 'invalid_block_data'
                await assert_silent(other)

    @async_test
    async def test_cursors_are_relayed_with_their_connection_and_clamped(self, owner, collaborator, page):
        async with open_socket(page.id, owner) as (mover, mover_connected):
            async with open_socket(page.id, collaborator) as (watcher, _):
                await collect(mover)
                await mover.send_json_to({'type': 'cursor_move', 'x': 120.5, 'y': -30})
                moved = await next_message(watcher, 'cursor_moved')
                assert moved == {
                    'type': 'cursor_moved',
                    'connection_id': mover_connected['connection_id'],
                    'user_id': str(owner.pk),
                    'username': owner.username,
                    'x': 120.5,
                    'y': -30.0,
                }

                await mover.send_json_to({'type': 'cursor_move', 'x': 10**12, 'y': -10**12})
                moved = await next_message(watcher, 'cursor_moved')
                assert (moved['x'], moved['y']) == (100_000.0, -100_000.0)
                await assert_silent(mover)

    @async_test
    async def test_invalid_cursors_are_dropped(self, owner, collaborator, page):
        async with open_socket(page.id, owner) as (mover, _):
            async with open_socket(page.id, collaborator) as (watcher, _):
                await next_message(mover, 'user_joined')
                for bad in (
                    {'x': 'left', 'y': 1}, {'x': 1}, {'x': None, 'y': 1}, {'x': True, 'y': 1},
                    {'x': [1], 'y': 1}, {'x': {'a': 1}, 'y': 1},
                ):
                    await mover.send_json_to({'type': 'cursor_move', **bad})
                # JSON.stringify never produces these, Python's json does and Channels accepts them
                for raw in ('{"type": "cursor_move", "x": NaN, "y": 1}', '{"type": "cursor_move", "x": 1, "y": Infinity}'):
                    await mover.send_to(text_data=raw)
                await assert_silent(watcher)

    @async_test
    async def test_garbage_messages_get_an_error_and_do_not_kill_the_socket(self, owner, page):
        async with open_socket(page.id, owner) as (communicator, _):
            await communicator.send_to(text_data='not json')
            assert (await next_message(communicator, 'error'))['code'] == 'invalid_message'
            await communicator.send_to(text_data=json.dumps([1, 2]))
            assert (await next_message(communicator, 'error'))['code'] == 'invalid_message'
            await communicator.send_json_to({'type': 'nope'})
            assert (await next_message(communicator, 'error'))['code'] == 'unknown_message_type'
            await communicator.send_json_to({'type': 'ping'})
            assert (await next_message(communicator, 'pong'))['type'] == 'pong'


# ─── Page changes made through REST ─────────────────────────


class TestPageUpdated:
    @async_test
    async def test_a_save_reaches_every_editor_with_the_new_version(self, owner, collaborator, page):
        async with open_socket(page.id, owner) as (saver, saver_connected):
            async with open_socket(page.id, collaborator) as (other, other_connected):
                response = await rest('put', owner, f'/api/pages/{page.id}/',
                                      {'name': 'Nuevo', 'blocks': [], 'version': 1})
                assert response.status_code == 200

                for socket in (other, saver):
                    message = await next_message(socket, 'page_updated')
                    assert message == {
                        'type': 'page_updated', 'version': 2, 'reason': 'save',
                        'by': {'user_id': str(owner.pk), 'username': owner.username},
                        'connection_id': None,
                    }
                assert saver_connected['connection_id'] != other_connected['connection_id']

    @async_test
    async def test_the_origin_connection_is_identified_by_the_header(self, owner, collaborator, page):
        async with open_socket(page.id, owner) as (saver, saver_connected):
            async with open_socket(page.id, collaborator) as (other, _):
                await rest('put', owner, f'/api/pages/{page.id}/', {'name': 'Nuevo', 'blocks': [], 'version': 1},
                           HTTP_X_CONNECTION_ID=saver_connected['connection_id'])

                for socket in (other, saver):
                    message = await next_message(socket, 'page_updated')
                    assert message['connection_id'] == saver_connected['connection_id']

    @async_test
    async def test_a_refused_save_tells_nobody(self, owner, page):
        async with open_socket(page.id, owner) as (communicator, _):
            await rest('put', owner, f'/api/pages/{page.id}/', {'name': 'Viejo', 'blocks': [], 'version': 7})
            await assert_silent(communicator)

    @async_test
    async def test_restore_publish_and_unpublish_notify_with_their_reason(self, owner, collaborator, page, block):
        version = await sync_to_async(PageVersion.objects.create)(
            page=page, version_number=1, snapshot=[{'type': 'cta', 'order': 0, 'data': {}, 'styles': {}}],
            page_metadata={}, created_by=owner,
        )
        async with open_socket(page.id, collaborator) as (watcher, _):
            await rest('post', owner, f'/api/pages/{page.id}/versions/{version.id}/restore/', {})
            restored = await next_message(watcher, 'page_updated')
            assert (restored['reason'], restored['version']) == ('restore', 2)

            await rest('post', owner, f'/api/pages/{page.id}/publish/', {})
            published = await next_message(watcher, 'page_updated')
            assert (published['reason'], published['version']) == ('publish', 3)

            await rest('post', owner, f'/api/pages/{page.id}/unpublish/', {})
            unpublished = await next_message(watcher, 'page_updated')
            assert (unpublished['reason'], unpublished['version']) == ('publish', 4)

            # No old-style message is sent any more
            assert not [m for m in await collect(watcher) if m['type'] == 'page_restored']


# ─── Sharing ────────────────────────────────────────────────


class TestAccessRevoked:
    @async_test
    async def test_unsharing_closes_the_collaborators_sockets_and_frees_their_locks(self, owner, collaborator, block, page):
        async with open_socket(page.id, owner) as (owner_socket, _):
            tab1 = new_communicator(page.id, collaborator)
            tab2 = new_communicator(page.id, collaborator)
            for tab in (tab1, tab2):
                assert (await tab.connect())[0] is True
                await tab.receive_json_from(timeout=TIMEOUT)
            await tab1.send_json_to({'type': 'lock_acquire', 'block_id': str(block.id)})
            await next_message(owner_socket, 'lock_acquired')

            response = await rest('post', owner, f'/api/pages/{page.id}/unshare/', {'user_id': str(collaborator.pk)})
            assert response.status_code == 200

            for tab in (tab1, tab2):
                error = await next_message(tab, 'error')
                assert error['code'] == 'access_revoked'
                close = await tab.receive_output(timeout=TIMEOUT)
                assert (close['type'], close['code']) == ('websocket.close', 4003)
                await tab.disconnect()  # what the server does after the app closes the socket

            released = await next_message(owner_socket, 'lock_released')
            assert released['block_id'] == str(block.id)
            assert get_lock_manager().get_lock_holder(str(page.id), str(block.id)) is None
            left = [m for m in await collect(owner_socket) if m['type'] == 'user_left']
            assert len(left) == 2

    @async_test
    async def test_unsharing_one_user_leaves_the_others_connected(self, owner, collaborator, page):
        other = await sync_to_async(make_user)('free')
        await sync_to_async(page.collaborators.add)(other)
        async with open_socket(page.id, other) as (kept, _):
            async with open_socket(page.id, collaborator) as (removed, _):
                await rest('post', owner, f'/api/pages/{page.id}/unshare/', {'user_id': str(collaborator.pk)})
                assert (await next_message(removed, 'error'))['code'] == 'access_revoked'
                assert (await removed.receive_output(timeout=TIMEOUT))['code'] == 4003
                await removed.disconnect()
                await next_message(kept, 'user_left')
                await kept.send_json_to({'type': 'ping'})
                assert (await next_message(kept, 'pong'))['type'] == 'pong'


# ─── Event loop ─────────────────────────────────────────────


@async_test
async def test_redis_lock_calls_run_in_a_thread_and_memory_ones_inline():
    import threading
    from collaboration.consumers import PageConsumer

    class SlowRedisLike:
        def get_locks(self, page_id):
            return {'thread': threading.current_thread().name}

    consumer = PageConsumer()
    consumer._lock_manager = SlowRedisLike()
    result = await consumer._lock_call('get_locks', 'p')
    assert result['thread'] != threading.current_thread().name

    consumer._lock_manager = get_lock_manager()  # in memory (REDIS_URL is not set in tests)
    assert await consumer._lock_call('get_locks', 'nobody') == {}


def test_page_model_starts_at_version_one(owner):
    assert Page.objects.get(pk=PageFactory(owner=owner).pk).version == 1

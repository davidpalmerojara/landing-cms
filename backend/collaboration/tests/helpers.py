"""Helpers for tests that open real WebSockets with channels.testing.WebsocketCommunicator.

There is no pytest-asyncio here: each test is a plain function whose body runs
in asyncio.run (see `async_test`). Database work from async code goes through
sync_to_async, which shares one thread with database_sync_to_async, so tests
must be marked django_db(transaction=True).
"""
import asyncio
import functools
import uuid
from contextlib import asynccontextmanager

from channels.layers import channel_layers
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from rest_framework_simplejwt.tokens import AccessToken

from accounts.cookies import ACCESS_COOKIE
from collaboration.middleware import JWTAuthMiddleware
from collaboration.routing import websocket_urlpatterns

application = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))

TIMEOUT = 2


def async_test(fn):
    """Run an `async def` test body to completion."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        channel_layers.backends = {}  # fresh in-memory layer bound to this event loop
        return asyncio.run(fn(*args, **kwargs))
    return wrapper


def new_communicator(page_id, user=None, *, via='ticket'):
    """A communicator for ws/pages/{id}/, authenticated by ticket, cookie or not at all."""
    path = f'/ws/pages/{page_id}/'
    headers = []
    if user is not None and via == 'ticket':
        ticket = f'test-ticket-{uuid.uuid4().hex}'
        cache.set(f'ws_ticket:{ticket}', str(user.pk), 30)
        path += f'?ticket={ticket}'
    elif user is not None and via == 'cookie':
        token = str(AccessToken.for_user(user))
        headers.append((b'cookie', f'{ACCESS_COOKIE}={token}'.encode()))
    return WebsocketCommunicator(application, path, headers=headers)


@asynccontextmanager
async def open_socket(page_id, user, *, via='ticket'):
    """A connected socket. Yields (communicator, the 'connected' message)."""
    communicator = new_communicator(page_id, user, via=via)
    connected, code = await communicator.connect()
    assert connected, f'connection refused with {code}'
    try:
        yield communicator, await communicator.receive_json_from(timeout=TIMEOUT)
    finally:
        await communicator.disconnect()


async def next_message(communicator, message_type, timeout=TIMEOUT):
    """The next message of this type, skipping any other (presence noise)."""
    while True:
        message = await communicator.receive_json_from(timeout=timeout)
        if message.get('type') == message_type:
            return message


async def assert_silent(communicator, timeout=0.2):
    """Nothing is waiting for this socket."""
    assert await communicator.receive_nothing(timeout=timeout), 'the socket received an unexpected message'


async def collect(communicator, timeout=0.2):
    """Everything that arrives until the socket is quiet for `timeout`."""
    messages = []
    while not await communicator.receive_nothing(timeout=timeout):
        messages.append(await communicator.receive_json_from(timeout=TIMEOUT))
    return messages

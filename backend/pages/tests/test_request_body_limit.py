"""SEC image requirement 4: bodies over the limit are refused before Django reads them (ADR-049)."""
import asyncio
import json

import pytest

from pages.upload_limits import RequestBodyLimit


class RecordingApp:
    """A stand-in for Django: reads the whole body, then answers 200."""

    def __init__(self):
        self.called = False
        self.body = b''
        self.disconnected = False

    async def __call__(self, scope, receive, send):
        self.called = True
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                # What Django's ASGI handler does: no response at all
                self.disconnected = True
                return
            self.body += message.get('body', b'')
            if not message.get('more_body'):
                break
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        await send({'type': 'http.response.body', 'body': b'ok'})


def run(app, headers, chunks):
    messages = [{'type': 'http.request', 'body': chunk, 'more_body': index < len(chunks) - 1}
                for index, chunk in enumerate(chunks)]
    sent = []

    async def receive():
        return messages.pop(0) if messages else {'type': 'http.disconnect'}

    async def send(message):
        sent.append(message)

    scope = {'type': 'http', 'method': 'POST', 'path': '/api/assets/', 'headers': headers}
    asyncio.run(RequestBodyLimit(app)(scope, receive, send))
    return sent


@pytest.fixture(autouse=True)
def small_limit(settings):
    settings.MAX_REQUEST_BODY_BYTES = 100


def test_declared_length_over_the_limit_is_413_without_calling_the_app():
    app = RecordingApp()
    sent = run(app, [(b'content-length', b'101')], [b'x' * 101])
    assert not app.called
    assert sent[0]['status'] == 413
    assert json.loads(sent[1]['body'])['code'] == 'REQUEST_TOO_LARGE'


def test_body_without_length_is_cut_off_at_the_limit():
    app = RecordingApp()
    sent = run(app, [], [b'x' * 60, b'x' * 60])
    assert app.disconnected
    assert [message['status'] for message in sent if message['type'] == 'http.response.start'] == [413]


def test_bodies_within_the_limit_pass_through():
    app = RecordingApp()
    sent = run(app, [(b'content-length', b'100')], [b'x' * 50, b'x' * 50])
    assert app.body == b'x' * 100
    assert sent[0]['status'] == 200


def test_websockets_are_not_touched():
    called = []

    async def app(scope, receive, send):
        called.append(scope['type'])

    async def noop(*args):
        return None

    asyncio.run(RequestBodyLimit(app)({'type': 'websocket', 'headers': [(b'content-length', b'999999')]}, noop, noop))
    assert called == ['websocket']


def test_the_asgi_application_is_wrapped(settings):
    settings.DEBUG = True  # importing it with DEBUG off runs the deploy checks
    from config import asgi
    assert isinstance(asgi.django_asgi, RequestBodyLimit)

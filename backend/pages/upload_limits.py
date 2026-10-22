"""Refusing request bodies that are too large before Django reads them (ADR-049).

Django caps form and JSON bodies (DATA_UPLOAD_MAX_MEMORY_SIZE) but not the
files of a multipart upload: it would copy any size to a temporary file and
parse it before the view could say no. This ASGI wrapper answers 413 from the
declared Content-Length, without reading the body. A body sent without a
length is counted as it arrives and cut off at the limit.
"""
import json

from django.conf import settings

MB = 1024 * 1024


def max_request_body_bytes() -> int:
    """Largest body of any request: the 5 MB image limit plus the multipart framing."""
    return getattr(settings, 'MAX_REQUEST_BODY_BYTES', 6 * MB)


TOO_LARGE_BODY = json.dumps({
    'error': 'La petición es demasiado grande.',
    'code': 'REQUEST_TOO_LARGE',
}).encode()


async def _send_too_large(send) -> None:
    await send({
        'type': 'http.response.start',
        'status': 413,
        'headers': [
            (b'content-type', b'application/json'),
            (b'content-length', str(len(TOO_LARGE_BODY)).encode()),
            (b'connection', b'close'),
        ],
    })
    await send({'type': 'http.response.body', 'body': TOO_LARGE_BODY})


def _declared_length(scope) -> int | None:
    for name, value in scope.get('headers', []):
        if name == b'content-length':
            try:
                return int(value)
            except ValueError:
                return None
    return None


class RequestBodyLimit:
    """ASGI middleware for HTTP: 413 for bodies over max_request_body_bytes()."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        limit = max_request_body_bytes()
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            return await _send_too_large(send)

        received = 0
        cut_off = False
        response_started = False

        async def limited_receive():
            nonlocal received, cut_off
            if cut_off:
                return {'type': 'http.disconnect'}
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > limit:
                    # Django stops reading on a disconnect and sends no response
                    cut_off = True
                    return {'type': 'http.disconnect'}
            return message

        async def tracked_send(message):
            nonlocal response_started
            if message['type'] == 'http.response.start':
                response_started = True
            await send(message)

        await self.app(scope, limited_receive, tracked_send)
        if cut_off and not response_started:
            await _send_too_large(send)

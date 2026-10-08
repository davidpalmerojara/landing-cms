"""
JWT authentication middleware for WebSocket connections.

Two ways to authenticate the handshake (ADR-010):
- ?ticket=<single-use ticket> from POST /api/auth/ws-ticket/, for when the
  socket lives on a different domain than the app and gets no cookies;
- the bp_access httpOnly cookie, when the socket is on the same site.
"""

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from urllib.parse import parse_qs

from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.http.cookie import parse_cookie
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from accounts.cookies import ACCESS_COOKIE

User = get_user_model()


def access_token_from_scope(scope) -> str | None:
    """Return the bp_access cookie value from the handshake headers, if any."""
    for name, value in scope.get('headers', []):
        if name == b'cookie':
            # Django's lenient parser, as for HTTP requests. http.cookies.SimpleCookie
            # stops at the first value it dislikes (e.g. Google's JSON g_state
            # cookie) and silently drops every cookie after it.
            return parse_cookie(value.decode('latin-1')).get(ACCESS_COOKIE)
    return None


@database_sync_to_async
def get_user_from_token(token_str: str):
    """Validate a JWT access token and return the corresponding user."""
    try:
        validated = AccessToken(token_str)
        return User.objects.get(pk=validated['user_id'])
    except (TokenError, KeyError, User.DoesNotExist):
        return AnonymousUser()


@database_sync_to_async
def get_user_from_ticket(ticket: str):
    """Consume a WebSocket ticket: valid once, for its short lifetime."""
    key = f'ws_ticket:{ticket}'
    user_id = cache.get(key)
    if user_id is None:
        return AnonymousUser()
    cache.delete(key)
    return User.objects.filter(pk=user_id).first() or AnonymousUser()


def ticket_from_scope(scope) -> str | None:
    tickets = parse_qs(scope.get('query_string', b'').decode('utf-8')).get('ticket')
    return tickets[0] if tickets else None


class JWTAuthMiddleware(BaseMiddleware):
    """ASGI middleware that authenticates WebSocket connections (ticket or cookie)."""

    async def __call__(self, scope, receive, send):
        ticket = ticket_from_scope(scope)
        if ticket:
            scope['user'] = await get_user_from_ticket(ticket)
        else:
            token = access_token_from_scope(scope)
            scope['user'] = await get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)

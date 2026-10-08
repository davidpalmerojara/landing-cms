"""
JWT authentication middleware for WebSocket connections.

Reads the access token from the same httpOnly cookie the REST API uses
(bp_access) and assigns the user to scope['user']. Browsers attach cookies
to the WebSocket handshake for the same site; a cross-site deployment will
use short-lived tickets instead (planned).
"""

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
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


class JWTAuthMiddleware(BaseMiddleware):
    """ASGI middleware that authenticates WebSocket connections with the access cookie."""

    async def __call__(self, scope, receive, send):
        token = access_token_from_scope(scope)
        scope['user'] = await get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)

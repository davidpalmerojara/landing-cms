"""CSRF protection for the cookie-authenticated API (ADR-008).

Auth lives only in httpOnly cookies, which the browser attaches to any
request to the API. SameSite=Lax already keeps them off most cross-site
requests; this middleware adds the standard Origin check on top: a
state-changing request that carries auth cookies (or targets an auth
endpoint) is rejected if the browser says it comes from another origin.

Browsers send Origin (or at least Referer) on every POST/PUT/PATCH/DELETE,
so a missing header means a non-browser client, which cannot be a CSRF
vector and is allowed.
"""

import logging
from urllib.parse import urlparse

from django.conf import settings
from django.http import JsonResponse

from .cookies import ACCESS_COOKIE, REFRESH_COOKIE

logger = logging.getLogger(__name__)

UNSAFE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})


def _origin_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        return f'{parsed.scheme}://{parsed.netloc}'
    return None


def request_origin(request) -> str | None:
    return request.headers.get('Origin') or _origin_from_url(request.headers.get('Referer', ''))


class OriginCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._needs_check(request):
            origin = request_origin(request)
            if origin is not None and origin not in settings.CSRF_TRUSTED_ORIGINS:
                logger.warning('Rejected %s %s from origin %s', request.method, request.path, origin)
                return JsonResponse({'error': 'Origen no permitido.', 'code': 'CSRF_ORIGIN'}, status=403)
        return self.get_response(request)

    @staticmethod
    def _needs_check(request) -> bool:
        if request.method not in UNSAFE_METHODS or not request.path.startswith('/api/'):
            return False
        carries_auth = ACCESS_COOKIE in request.COOKIES or REFRESH_COOKIE in request.COOKIES
        return carries_auth or request.path.startswith('/api/auth/')

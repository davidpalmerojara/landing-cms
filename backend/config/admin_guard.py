"""Rate limit for the Django admin sign-in (QA-102).

The admin has no rate limit of its own, and its login form is a password-guessing
target. The limit is per client address (honouring NUM_PROXIES like the API
throttles) and counts every POST to the login page, successful or not.
"""
import time
from functools import wraps

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse
from rest_framework.throttling import BaseThrottle

_SECONDS = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}


def _parse_rate(rate: str) -> tuple[int, int]:
    """'10/minute' -> (10, 60), the same format as DRF's throttle rates."""
    number, period = rate.split('/')
    return int(number), _SECONDS[period[0]]


def limit_admin_login(login_view):
    """Wrap AdminSite.login: past the limit, a POST gets 429 and never reaches the form."""

    @wraps(login_view)
    def limited(request, *args, **kwargs):
        if request.method == 'POST':
            limit, window = _parse_rate(settings.ADMIN_LOGIN_RATE)
            key = f'admin_login:{BaseThrottle().get_ident(request)}'
            now = time.time()
            attempts = [t for t in cache.get(key, []) if now - t < window]
            if len(attempts) >= limit:
                return HttpResponse('Too many attempts. Try again later.', status=429, content_type='text/plain')
            attempts.append(now)
            cache.set(key, attempts, window)
        return login_view(request, *args, **kwargs)

    return limited

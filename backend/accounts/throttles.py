from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle


class CurrentRatesMixin:
    """DRF copies the rates onto the class at import time; read the current
    settings instead so overrides (tests, environment) always apply."""

    def __init__(self):
        self.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES
        super().__init__()


class AuthRateThrottle(CurrentRatesMixin, SimpleRateThrottle):
    """Stricter per-IP limit for auth endpoints (login, register, magic link, join).

    It counts every request, signed in or not. It used to extend DRF's
    AnonRateThrottle, which skips authenticated requests: any session cookie
    (a guest is one click away) lifted the limit on sign-ups and magic-link
    emails (SEC2-001). Uses DRF's get_ident, so it honours NUM_PROXIES."""
    scope = 'auth'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class SignedInAuthRateThrottle(CurrentRatesMixin, SimpleRateThrottle):
    """The auth limit for requests that re-check the password of a signed-in
    account (AuthRateThrottle only counts anonymous requests)."""
    scope = 'auth'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}


class LoginUsernameThrottle(CurrentRatesMixin, SimpleRateThrottle):
    """Per-account limit on login attempts, whatever IP they come from, so
    spreading a password-guessing attack over many addresses doesn't help."""
    scope = 'login_username'

    def get_cache_key(self, request, view):
        username = request.data.get('username') if hasattr(request, 'data') else None
        if not isinstance(username, str) or not username.strip():
            return None
        return self.cache_format % {'scope': self.scope, 'ident': username.strip().lower()}


class GuestCreationThrottle(CurrentRatesMixin, SimpleRateThrottle):
    """Per-IP limit on starting guest sessions. Uses DRF's get_ident, so it
    honours NUM_PROXIES and a spoofed X-Forwarded-For does not reset it."""
    scope = 'guest'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}

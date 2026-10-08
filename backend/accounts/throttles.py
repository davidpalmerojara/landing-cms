from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class CurrentRatesMixin:
    """DRF copies the rates onto the class at import time; read the current
    settings instead so overrides (tests, environment) always apply."""

    def __init__(self):
        self.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES
        super().__init__()


class AuthRateThrottle(CurrentRatesMixin, AnonRateThrottle):
    """Stricter per-IP limit for auth endpoints (login, register, magic link)."""
    scope = 'auth'


class LoginUsernameThrottle(CurrentRatesMixin, SimpleRateThrottle):
    """Per-account limit on login attempts, whatever IP they come from, so
    spreading a password-guessing attack over many addresses doesn't help."""
    scope = 'login_username'

    def get_cache_key(self, request, view):
        username = request.data.get('username') if hasattr(request, 'data') else None
        if not isinstance(username, str) or not username.strip():
            return None
        return self.cache_format % {'scope': self.scope, 'ident': username.strip().lower()}

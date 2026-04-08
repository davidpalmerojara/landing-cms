from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """Stricter rate limit for auth endpoints (login, register, magic link)."""
    scope = 'auth'

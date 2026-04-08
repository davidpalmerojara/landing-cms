"""Utility to set JWT tokens as httpOnly cookies on auth responses."""

from django.conf import settings

# Cookie names
ACCESS_COOKIE = 'bp_access'
REFRESH_COOKIE = 'bp_refresh'


def set_auth_cookies(response, access_token: str, refresh_token: str):
    """Set httpOnly, secure cookies for JWT tokens."""
    is_secure = not settings.DEBUG

    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=3600,  # 1 hour (matches ACCESS_TOKEN_LIFETIME)
        httponly=True,
        secure=is_secure,
        samesite='Lax',
        path='/',
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=7 * 24 * 3600,  # 7 days (matches REFRESH_TOKEN_LIFETIME)
        httponly=True,
        secure=is_secure,
        samesite='Lax',
        path='/api/auth/',  # Only sent to auth endpoints
    )
    return response


def clear_auth_cookies(response):
    """Remove JWT cookies (logout)."""
    response.delete_cookie(ACCESS_COOKIE, path='/')
    response.delete_cookie(REFRESH_COOKIE, path='/api/auth/')
    return response

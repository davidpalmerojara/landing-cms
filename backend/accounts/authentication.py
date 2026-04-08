"""JWT authentication that reads from httpOnly cookies with header fallback."""

from rest_framework_simplejwt.authentication import JWTAuthentication
from .cookies import ACCESS_COOKIE


class CookieJWTAuthentication(JWTAuthentication):
    """
    Extends simplejwt's JWTAuthentication to also check httpOnly cookies.
    Priority: Authorization header > cookie.
    """

    def authenticate(self, request):
        # Try standard Authorization header first
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        # Fall back to cookie
        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token

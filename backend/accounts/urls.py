from django.contrib.auth import get_user_model
from django.urls import path
from rest_framework import permissions, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.views import TokenObtainPairView
from .guests import is_expired_guest
from .messages import message
from .cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .throttles import AuthRateThrottle, LoginUsernameThrottle, RefreshRateThrottle
from .views import (
    GoogleLoginView,
    GuestClaimView,
    GuestView,
    JoinView,
    LogoutView,
    MagicLinkRequestView,
    MagicLinkVerifyView,
    RegisterView,
    MeView,
    WsTicketView,
)

User = get_user_model()


class CookieTokenObtainPairView(TokenObtainPairView):
    """Login: sets the JWTs as httpOnly cookies and keeps them out of the body."""
    throttle_classes = [AuthRateThrottle, LoginUsernameThrottle]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        # A username or password that is empty (or only spaces) matches no
        # account: the same answer as a wrong password, not a "validation
        # error" the sign-in page reads as a server failure (APP2-009). A wrong
        # password gets it too, instead of simplejwt's English text (SEC3-004)
        wrong_credentials = Response(
            {'error': message('invalid_credentials'), 'code': 'INVALID_CREDENTIALS'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
        if not self._has_credentials(request.data):
            return wrong_credentials
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            if self._signs_in_without_password(request.data['username']):
                # The account has no password (magic link or Google), or the one it had was
                # turned off when the owner of the email signed in (ADR-018): say so (UX-003)
                return Response(
                    {'error': message('password_disabled'), 'code': 'PASSWORD_DISABLED'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            return wrong_credentials
        if response.status_code == 200:
            set_auth_cookies(response, response.data['access'], response.data['refresh'])
            response.data = {'message': message('signed_in')}
        return response

    @staticmethod
    def _signs_in_without_password(identifier: str) -> bool:
        """An account named by this username (or email) exists and has no usable password.

        Says no more than registration does ("that username/email is taken"), and
        lets the sign-in page offer the email link instead of "wrong password"."""
        identifier = identifier.strip()
        user = (
            User.objects.filter(username__iexact=identifier).first()
            or User.objects.filter(email__iexact=identifier).first()
        )
        return user is not None and not user.is_guest and not user.has_usable_password()

    @staticmethod
    def _has_credentials(data) -> bool:
        if not isinstance(data, dict):
            return False
        username, password = data.get('username'), data.get('password')
        return isinstance(username, str) and bool(username.strip()) and isinstance(password, str) and bool(password)


class SingleUseRefreshSerializer(TokenRefreshSerializer):
    """simplejwt's rotation, with the old token taken exactly once (SEC-007).

    simplejwt checks the blacklist when it reads the token and blacklists it
    later with get_or_create, so parallel refreshes with one token all passed
    the check and each got its own new refresh token. Here the blacklist row is
    the claim: only the request that creates it rotates; the others are refused.
    """

    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])
        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM)
        user = User.objects.get(**{api_settings.USER_ID_FIELD: user_id})
        if not api_settings.USER_AUTHENTICATION_RULE(user):
            raise AuthenticationFailed('No active account found for the given token.', 'no_active_account')

        _, created = refresh.blacklist()
        if not created:
            raise TokenError('Token already used')

        data = {'access': str(refresh.access_token)}
        refresh.set_jti()
        refresh.set_exp()
        refresh.set_iat()
        refresh.outstand()
        data['refresh'] = str(refresh)
        return data


class CookieTokenRefreshView(APIView):
    """Refresh using only the refresh cookie. Rotates it and blacklists the old one."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [RefreshRateThrottle]

    @staticmethod
    def _belongs_to_expired_guest(raw_refresh: str) -> bool:
        try:
            user_id = RefreshToken(raw_refresh)['user_id']
        except (TokenError, KeyError):
            # Not a usable token: the refresh serializer rejects it below
            return False
        user = User.objects.filter(pk=user_id, is_guest=True).first()
        return user is not None and is_expired_guest(user)

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response({'error': message('no_session'), 'code': 'NO_REFRESH_TOKEN'}, status=status.HTTP_401_UNAUTHORIZED)

        if self._belongs_to_expired_guest(raw_refresh):
            response = Response(
                {'error': message('guest_expired'), 'code': 'GUEST_EXPIRED'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        serializer = SingleUseRefreshSerializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, ValidationError, AuthenticationFailed, User.DoesNotExist):
            # User.DoesNotExist: the account was deleted while its refresh token was still valid (QA-101)
            response = Response({'error': message('session_expired'), 'code': 'INVALID_REFRESH_TOKEN'}, status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response

        tokens = serializer.validated_data
        response = Response({'message': message('session_refreshed')})
        set_auth_cookies(response, tokens['access'], tokens.get('refresh', raw_refresh))
        return response


urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', CookieTokenObtainPairView.as_view(), name='auth-login'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='auth-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('guest/', GuestView.as_view(), name='auth-guest'),
    path('guest/claim/', GuestClaimView.as_view(), name='auth-guest-claim'),
    path('join/', JoinView.as_view(), name='auth-join'),
    path('google/', GoogleLoginView.as_view(), name='auth-google'),
    path('magic/request/', MagicLinkRequestView.as_view(), name='auth-magic-request'),
    path('magic/verify/', MagicLinkVerifyView.as_view(), name='auth-magic-verify'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('ws-ticket/', WsTicketView.as_view(), name='auth-ws-ticket'),
]

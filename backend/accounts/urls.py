from django.contrib.auth import get_user_model
from django.urls import path
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .guests import is_expired_guest
from .messages import message
from .cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .throttles import AuthRateThrottle, LoginUsernameThrottle
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
        if not self._has_credentials(request.data):
            # A username or password that is empty (or only spaces) matches no
            # account: the same answer as a wrong password, not a "validation
            # error" the sign-in page reads as a server failure (APP2-009)
            return Response(
                {'error': message('invalid_credentials'), 'code': 'INVALID_CREDENTIALS'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_auth_cookies(response, response.data['access'], response.data['refresh'])
            response.data = {'message': message('signed_in')}
        return response


    @staticmethod
    def _has_credentials(data) -> bool:
        if not hasattr(data, 'get'):
            return False
        username, password = data.get('username'), data.get('password')
        return isinstance(username, str) and bool(username.strip()) and isinstance(password, str) and bool(password)


class CookieTokenRefreshView(APIView):
    """Refresh using only the refresh cookie. Rotates it and blacklists the old one."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

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

        serializer = TokenRefreshSerializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, ValidationError, User.DoesNotExist):
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

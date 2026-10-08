from django.urls import path
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .throttles import AuthRateThrottle
from .views import (
    AISettingsView,
    GoogleLoginView,
    LogoutView,
    MagicLinkRequestView,
    MagicLinkVerifyView,
    RegisterView,
    MeView,
)


class CookieTokenObtainPairView(TokenObtainPairView):
    """Login: sets the JWTs as httpOnly cookies and keeps them out of the body."""
    throttle_classes = [AuthRateThrottle]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_auth_cookies(response, response.data['access'], response.data['refresh'])
            response.data = {'message': 'Sesión iniciada.'}
        return response


class CookieTokenRefreshView(APIView):
    """Refresh using only the refresh cookie. Rotates it and blacklists the old one."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response({'error': 'No hay sesión.', 'code': 'NO_REFRESH_TOKEN'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, ValidationError):
            response = Response({'error': 'La sesión ha caducado.', 'code': 'INVALID_REFRESH_TOKEN'}, status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response

        tokens = serializer.validated_data
        response = Response({'message': 'Sesión renovada.'})
        set_auth_cookies(response, tokens['access'], tokens.get('refresh', raw_refresh))
        return response


urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', CookieTokenObtainPairView.as_view(), name='auth-login'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='auth-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('google/', GoogleLoginView.as_view(), name='auth-google'),
    path('magic/request/', MagicLinkRequestView.as_view(), name='auth-magic-request'),
    path('magic/verify/', MagicLinkVerifyView.as_view(), name='auth-magic-verify'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('ai-settings/', AISettingsView.as_view(), name='auth-ai-settings'),
]

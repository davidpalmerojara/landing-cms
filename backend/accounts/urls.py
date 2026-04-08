from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .cookies import set_auth_cookies, REFRESH_COOKIE
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
    """Login that also sets httpOnly cookies."""
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_auth_cookies(
                response,
                response.data['access'],
                response.data['refresh'],
            )
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh that reads refresh token from cookie if not in body, and sets new cookies."""
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        # If refresh token not in body, try cookie
        if 'refresh' not in request.data and REFRESH_COOKIE in request.COOKIES:
            request.data._mutable = True
            request.data['refresh'] = request.COOKIES[REFRESH_COOKIE]
            request.data._mutable = False
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            access = response.data.get('access', '')
            refresh = response.data.get('refresh', request.data.get('refresh', ''))
            if access:
                set_auth_cookies(response, access, refresh)
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

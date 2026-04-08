import secrets
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import MagicToken
from .serializers import (
    AISettingsSerializer,
    GoogleAuthSerializer,
    MagicLinkRequestSerializer,
    MagicLinkVerifySerializer,
    RegisterSerializer,
    UserSerializer,
)
from .cookies import set_auth_cookies, clear_auth_cookies
from .throttles import AuthRateThrottle

User = get_user_model()


def _auth_response(user, status_code=200):
    """Build auth response with both JSON tokens and httpOnly cookies."""
    refresh = RefreshToken.for_user(user)
    access = str(refresh.access_token)
    refresh_str = str(refresh)
    response = Response({
        'user': UserSerializer(user).data,
        'tokens': {
            'access': access,
            'refresh': refresh_str,
        },
    }, status=status_code)
    set_auth_cookies(response, access, refresh_str)
    return response


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — create account and return tokens."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Create default workspace (triggers Free subscription via signal)
        from pages.models import Workspace
        Workspace.objects.get_or_create(
            owner=user,
            defaults={'name': f'{user.username}\'s workspace'},
        )

        return _auth_response(user, status_code=status.HTTP_201_CREATED)


class MeView(APIView):
    """GET /api/auth/me/ — return current user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class GoogleLoginView(APIView):
    """POST /api/auth/google/ — verify Google ID token and return JWT."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token']

        client_id = settings.GOOGLE_CLIENT_ID
        if not client_id:
            return Response(
                {'error': 'Google OAuth no está configurado.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Verify the Google ID token
        try:
            idinfo = google_id_token.verify_oauth2_token(
                token, google_requests.Request(), client_id
            )
        except ValueError:
            return Response(
                {'error': 'Token de Google inválido o expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not idinfo.get('email_verified'):
            return Response(
                {'error': 'El email de Google no está verificado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        google_sub = idinfo['sub']
        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')

        # Find or create user
        user = User.objects.filter(google_id=google_sub).first()

        if not user:
            # Check if email is already taken by another account
            user = User.objects.filter(email=email).first()
            if user:
                # Link Google to the existing account so the same identity can
                # sign in via either password or Google OAuth.
                user.google_id = google_sub
                if picture:
                    user.avatar = picture
                user.save(update_fields=['google_id', 'avatar', 'updated_at'])
            else:
                # Create new user
                base_username = email.split('@')[0][:30]
                username = base_username
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}_{uuid.uuid4().hex[:6]}"

                user = User(
                    username=username,
                    email=email,
                    google_id=google_sub,
                    avatar=picture,
                )
                user.set_unusable_password()
                user.save()

        return _auth_response(user)


class MagicLinkRequestView(APIView):
    """POST /api/auth/magic/request/ — send magic link email."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = MagicLinkRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # Invalidate previous unused tokens for this email
        MagicToken.objects.filter(email=email, used=False).update(used=True)

        # Create new token
        token = secrets.token_urlsafe(48)
        MagicToken.objects.create(email=email, token=token)

        # Build magic link URL
        frontend_url = settings.FRONTEND_URL.rstrip('/')
        magic_url = f"{frontend_url}/auth/magic/{token}"

        # Send email
        send_mail(
            subject='Tu enlace de acceso a BuilderPro',
            message=f'Haz clic en el siguiente enlace para iniciar sesión:\n\n{magic_url}\n\nEste enlace expira en 15 minutos.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            html_message=(
                f'<p>Haz clic en el siguiente enlace para iniciar sesión en BuilderPro:</p>'
                f'<p><a href="{magic_url}" style="display:inline-block;background:#4f46e5;color:#fff;'
                f'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">'
                f'Iniciar sesión</a></p>'
                f'<p style="color:#666;font-size:14px;">Este enlace expira en 15 minutos. '
                f'Si no solicitaste este acceso, ignora este correo.</p>'
            ),
        )

        # Always return success (don't reveal if email exists)
        return Response({'message': 'Si el email existe, recibirás un enlace de acceso.'})


class MagicLinkVerifyView(APIView):
    """POST /api/auth/magic/verify/ — verify magic token and return JWT."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = MagicLinkVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token']

        # Atomic update to prevent TOCTOU race condition
        updated_count = MagicToken.objects.filter(
            token=token, used=False
        ).update(used=True)

        if updated_count == 0:
            return Response(
                {'error': 'Enlace inválido o expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        magic = MagicToken.objects.get(token=token)
        if magic.is_expired():
            return Response(
                {'error': 'Enlace inválido o expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = magic.email

        # Find or create user
        user = User.objects.filter(email=email).first()
        if not user:
            base_username = email.split('@')[0][:30]
            username = base_username
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{uuid.uuid4().hex[:6]}"

            user = User(username=username, email=email)
            user.set_unusable_password()
            user.save()

        return _auth_response(user)


class LogoutView(APIView):
    """POST /api/auth/logout/ — clear auth cookies."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        response = Response({'message': 'Sesión cerrada.'})
        clear_auth_cookies(response)
        return response


class AISettingsView(APIView):
    """GET/PUT /api/auth/ai-settings/ — manage user's AI API keys."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        masked_key = ''
        if user.ai_api_key:
            masked_key = '•' * 12 + user.ai_api_key[-4:]
        return Response({
            'ai_provider': user.ai_provider,
            'ai_api_key': masked_key,
            'has_key': bool(user.ai_api_key),
        })

    def put(self, request):
        serializer = AISettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        provider = serializer.validated_data.get('ai_provider', '')
        api_key = serializer.validated_data.get('ai_api_key', '')

        user.ai_provider = provider
        if api_key and not api_key.startswith('•'):
            user.ai_api_key = api_key
        elif not api_key:
            user.ai_api_key = ''

        user.save(update_fields=['ai_provider', 'ai_api_key'])

        return Response({
            'ai_provider': user.ai_provider,
            'has_key': bool(user.ai_api_key),
            'message': 'Configuración de IA guardada.',
        })

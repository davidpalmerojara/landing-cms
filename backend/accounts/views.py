import logging
import secrets
import uuid

from django.conf import settings
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import generics, permissions, status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .deletion import delete_account, has_active_stripe_subscription
from .guests import (
    GuestCapacityReached,
    NotAGuest,
    active_guests,
    claim_guest,
    create_guest,
    sweep_before_creating,
)
from .models import MagicToken
from .ownership import confirm_email_owner
from .permissions import IsNotGuest
from .serializers import (
    DeleteAccountSerializer,
    GoogleAuthSerializer,
    MagicLinkRequestSerializer,
    MagicLinkVerifySerializer,
    RegisterSerializer,
    UserSerializer,
)
from .cookies import REFRESH_COOKIE, set_auth_cookies, clear_auth_cookies
from .throttles import AuthRateThrottle, GuestCreationThrottle, SignedInAuthRateThrottle

User = get_user_model()
logger = logging.getLogger(__name__)


def _auth_response(user, status_code=200, password_disabled=False):
    """Auth response: tokens go only into httpOnly cookies, never the JSON body (ADR-008).

    password_disabled tells the client that signing in took over an account whose
    password had never been confirmed by email, so it can explain what happened.
    """
    refresh = RefreshToken.for_user(user)
    body = {'user': UserSerializer(user).data}
    if password_disabled:
        body['password_disabled'] = True
    response = Response(body, status=status_code)
    set_auth_cookies(response, str(refresh.access_token), str(refresh))
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


class GuestView(APIView):
    """POST /api/auth/guest/ — start a temporary guest session (24 h by default)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [GuestCreationThrottle]

    def post(self, request):
        sweep_before_creating()
        if active_guests().count() >= settings.GUEST_MAX_ACTIVE:
            logger.warning('Guest capacity reached (%s active)', settings.GUEST_MAX_ACTIVE)
            raise GuestCapacityReached()
        user = create_guest()
        return _auth_response(user, status_code=status.HTTP_201_CREATED)


class InviteInvalid(APIException):
    """One answer for unknown, expired and used-up links, so a token cannot be probed."""
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'INVITE_INVALID'

    def __init__(self):
        super().__init__(detail={'error': 'Este enlace de invitación no es válido o ha caducado.', 'code': 'INVITE_INVALID'})


class JoinView(APIView):
    """POST /api/auth/join/ — open a page invite link.

    A signed-in user becomes a collaborator of the page; someone without a
    session gets a new guest (same limits and cookies as /guest/) who becomes
    one. The owner just gets the page back.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        from pages.models import PageInvite

        token = request.data.get('token') if hasattr(request.data, 'get') else None
        invite = (
            PageInvite.objects.select_related('page').filter(token=token).first()
            if isinstance(token, str) and 0 < len(token) <= 100 else None
        )
        if invite is None or not self._is_open(invite):
            raise InviteInvalid()
        page = invite.page

        if request.user.is_authenticated:
            user = request.user
            if page.owner_id != user.pk and not page.collaborators.filter(pk=user.pk).exists():
                with transaction.atomic():
                    self._use(invite)
                    page.collaborators.add(user)
            return Response({'page_id': str(page.pk), 'user': UserSerializer(user).data})

        # Starting a session is what the guest throttle and capacity limit protect
        self._throttle_guest_creation(request)
        sweep_before_creating()
        if active_guests().count() >= settings.GUEST_MAX_ACTIVE:
            logger.warning('Guest capacity reached (%s active)', settings.GUEST_MAX_ACTIVE)
            raise GuestCapacityReached()
        with transaction.atomic():
            # If the use cannot be taken (someone else took the last one) no guest is created
            self._use(invite)
            user = create_guest()
            page.collaborators.add(user)
        response = _auth_response(user, status_code=status.HTTP_201_CREATED)
        response.data['page_id'] = str(page.pk)
        return response

    @staticmethod
    def _is_open(invite) -> bool:
        return invite.expires_at > timezone.now() and invite.uses < invite.max_uses

    @staticmethod
    def _use(invite) -> None:
        """Take one use atomically: of five simultaneous joins on the last use, one wins."""
        from pages.models import PageInvite

        taken = PageInvite.objects.filter(
            pk=invite.pk, uses__lt=F('max_uses'), expires_at__gt=timezone.now(),
        ).update(uses=F('uses') + 1)
        if taken == 0:
            raise InviteInvalid()

    def _throttle_guest_creation(self, request) -> None:
        throttle = GuestCreationThrottle()
        if not throttle.allow_request(request, self):
            self.throttled(request, throttle.wait())


class GuestClaimView(APIView):
    """POST /api/auth/guest/claim/ — a guest signs up and keeps its pages.

    Takes the same fields and runs the same validation as register. The guest
    becomes a normal Free account and gets a fresh session.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.is_guest:
            raise NotAGuest()
        serializer = RegisterSerializer(user, data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        claim_guest(user, username=data['username'], email=data['email'], password=data['password'])
        return _auth_response(user)


class MeView(APIView):
    """GET /api/auth/me/ — return current user.

    DELETE /api/auth/me/ — delete the account and everything it owns (ADR-026).
    Body: `password` for accounts with a password, `confirm_username` for the
    rest. 409 ACTIVE_SUBSCRIPTION while a paid Stripe subscription still runs.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # A guest account is deleted on its own after a day: nothing to confirm
        if self.request.method == 'DELETE':
            return [permissions.IsAuthenticated(), IsNotGuest()]
        return super().get_permissions()

    def get_throttles(self):
        # The password is checked here, so guessing it is rate limited like a login
        if self.request.method == 'DELETE':
            return [SignedInAuthRateThrottle()]
        return super().get_throttles()

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        user = request.user
        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if user.has_usable_password():
            if not user.check_password(data.get('password', '')):
                return Response(
                    {'error': 'La contraseña no es correcta.', 'code': 'INVALID_PASSWORD'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif data.get('confirm_username', '') != user.username:
            return Response(
                {'error': 'Escribe tu nombre de usuario exactamente para confirmar.', 'code': 'CONFIRMATION_MISMATCH'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if has_active_stripe_subscription(user):
            return Response(
                {
                    'error': 'Tienes una suscripción de pago activa. Cancélala desde Facturación antes de eliminar tu cuenta.',
                    'code': 'ACTIVE_SUBSCRIPTION',
                },
                status=status.HTTP_409_CONFLICT,
            )

        delete_account(user)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


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
        password_disabled = False

        if not user:
            user = User.objects.filter(email=email).first()
            if user:
                # Google verified this email, so the person signing in owns it.
                # A password set by whoever registered the address first stops working.
                password_disabled = confirm_email_owner(user)
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
                    email_verified=True,
                )
                user.set_unusable_password()
                user.save()

        return _auth_response(user, password_disabled=password_disabled)


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
            subject='Tu enlace de acceso a Paxl',
            message=f'Haz clic en el siguiente enlace para iniciar sesión:\n\n{magic_url}\n\nEste enlace expira en 15 minutos.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            html_message=(
                f'<p>Haz clic en el siguiente enlace para iniciar sesión en Paxl:</p>'
                f'<p><a href="{magic_url}" style="display:inline-block;background:#2563EB;color:#fff;'
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
        password_disabled = False
        if user:
            # The link reached this inbox, so the person signing in owns the email
            password_disabled = confirm_email_owner(user)
        else:
            base_username = email.split('@')[0][:30]
            username = base_username
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{uuid.uuid4().hex[:6]}"

            user = User(username=username, email=email, email_verified=True)
            user.set_unusable_password()
            user.save()

        return _auth_response(user, password_disabled=password_disabled)


class LogoutView(APIView):
    """POST /api/auth/logout/ — revoke the refresh token and clear the cookies."""
    permission_classes = [permissions.AllowAny]
    # Logging out must work even with an expired or invalid access cookie
    authentication_classes = []

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                # Already expired or revoked: there is nothing left to invalidate
                logger.info('Logout with an invalid refresh token')
        response = Response({'message': 'Sesión cerrada.'})
        clear_auth_cookies(response)
        return response


WS_TICKET_TTL = 30  # seconds


class WsTicketView(APIView):
    """POST /api/auth/ws-ticket/ — single-use ticket to open the collaboration
    WebSocket. The request is authenticated by the session cookie (through
    the same-site /api rewrite); the socket itself may live on another domain
    where that cookie is not sent (ADR-010)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ticket = secrets.token_urlsafe(32)
        cache.set(f'ws_ticket:{ticket}', str(request.user.pk), WS_TICKET_TTL)
        return Response({'ticket': ticket, 'expires_in': WS_TICKET_TTL})


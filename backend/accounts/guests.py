"""Guest mode: "try the editor without signing up".

A guest is a temporary user with a throwaway username and an unusable
password. It gets a Pro workspace (so the demo shows the whole product) but
cannot upload files, use billing, connect domains or share pages, and its
published pages are noindex and carry the watermark. Everything is deleted
GUEST_LIFETIME_HOURS after creation: there is no cron on the free hosting, so
each new guest first sweeps the expired ones, and `manage.py cleanup_guests`
does the same on demand.

A guest can keep its work by claiming the account with a username, email and
password (`claim_guest`): it becomes a normal Free account.
"""
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed

from .sessions import revoke_all_sessions

logger = logging.getLogger(__name__)

# Reserved by RFC 2606: no real mailbox can ever exist here, so a guest's
# placeholder email can never collide with, or be mistaken for, a real one.
GUEST_EMAIL_DOMAIN = 'guest.invalid'
GUEST_USERNAME_PREFIX = 'invitado-'
# Guests removed per sweep when it runs inside a request, to bound its latency
SWEEP_BATCH_SIZE = 50
# Saved versions kept per page for a guest (the Pro plan itself keeps all of them)
GUEST_MAX_VERSIONS = 10


class GuestNotAllowed(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'GUEST_NOT_ALLOWED'

    def __init__(self, message='Esta función no está disponible en una sesión de invitado. Crea una cuenta para usarla.'):
        super().__init__(detail={'error': message, 'code': 'GUEST_NOT_ALLOWED'})


class NotAGuest(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'NOT_GUEST'

    def __init__(self):
        super().__init__(detail={'error': 'Esta cuenta no es de invitado.', 'code': 'NOT_GUEST'})


class GuestExpired(AuthenticationFailed):
    def __init__(self):
        super().__init__(detail={'error': 'La sesión de invitado ha caducado.', 'code': 'GUEST_EXPIRED'})


class GuestPageLimitExceeded(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'GUEST_PAGE_LIMIT'

    def __init__(self, limit):
        super().__init__(detail={
            'error': f'Una sesión de invitado permite hasta {limit} páginas. Crea una cuenta para seguir.',
            'code': 'GUEST_PAGE_LIMIT',
        })


class GuestCapacityReached(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'GUEST_CAPACITY'

    def __init__(self):
        super().__init__(detail={
            'error': 'Hay demasiadas sesiones de invitado activas ahora mismo. Inténtalo de nuevo en un rato o crea una cuenta.',
            'code': 'GUEST_CAPACITY',
        })


def guest_lifetime() -> timedelta:
    return timedelta(hours=settings.GUEST_LIFETIME_HOURS)


def guest_expires_at(user):
    """When the guest's account is deleted, or None for a normal account."""
    if not user.is_guest:
        return None
    return user.created_at + guest_lifetime()


def is_expired_guest(user) -> bool:
    expires_at = guest_expires_at(user)
    return expires_at is not None and timezone.now() >= expires_at


def active_guests():
    User = get_user_model()
    return User.objects.filter(is_guest=True, created_at__gt=timezone.now() - guest_lifetime())


def _grant_pro_plan(workspace, expires_at):
    """Give the guest's workspace an active Pro subscription without Stripe."""
    from billing.models import Plan, Subscription

    pro_plan = Plan.objects.filter(name='pro', is_active=True).first()
    if pro_plan is None:
        logger.error('No active Pro plan: the guest workspace %s keeps the Free plan', workspace.pk)
        return
    # The workspace signal already created a Free subscription
    Subscription.objects.update_or_create(
        workspace=workspace,
        defaults={
            'plan': pro_plan,
            'status': Subscription.Status.ACTIVE,
            'current_period_end': expires_at,
        },
    )


def _new_guest_identity() -> tuple[str, str]:
    suffix = secrets.token_hex(4)
    username = f'{GUEST_USERNAME_PREFIX}{suffix}'
    return username, f'{username}@{GUEST_EMAIL_DOMAIN}'


def create_guest():
    """Create a guest user with its workspace and Pro subscription."""
    from pages.models import Workspace

    User = get_user_model()
    for _ in range(5):
        username, email = _new_guest_identity()
        user = User(username=username, email=email, is_guest=True, email_verified=False)
        user.set_unusable_password()
        try:
            with transaction.atomic():
                user.save()
                workspace = Workspace.objects.create(owner=user, name=f"{user.username}'s workspace")
                _grant_pro_plan(workspace, user.created_at + guest_lifetime())
            return user
        except IntegrityError:
            logger.warning('Guest username collision for %s, retrying', username)
    raise RuntimeError('Could not find a free guest username')


def cleanup_expired_guests(limit=None) -> int:
    """Delete guests older than the lifetime, with everything they own.

    The database cascades remove their workspace, subscription, pages, blocks,
    versions, form submissions, analytics events and AI logs. Uploaded files
    are not covered by the cascade, so they are deleted from storage here.
    Returns how many guests were deleted.
    """
    from .deletion import delete_users_with_data

    User = get_user_model()
    expired = User.objects.filter(is_guest=True, created_at__lte=timezone.now() - guest_lifetime())
    ids = list(expired.order_by('created_at').values_list('pk', flat=True)[:limit])
    if not ids:
        return 0

    deletion = delete_users_with_data(ids)
    logger.info(
        'Deleted %s expired guests (%s database rows, %s files)',
        deletion.users, deletion.rows, deletion.files,
    )
    return deletion.users


def sweep_before_creating() -> None:
    """Best effort: a failed sweep must not stop a new guest from starting."""
    try:
        cleanup_expired_guests(limit=SWEEP_BATCH_SIZE)
    except Exception:
        logger.exception('Sweeping expired guests failed')


def claim_guest(user, *, username, email, password):
    """Turn a guest into a normal Free account that keeps all its pages.

    The caller has validated username, email and password. The guest's session
    is replaced: every refresh token it had is blacklisted, so the caller must
    issue fresh cookies afterwards.
    """
    from billing.models import Plan, Subscription
    from billing.permissions import invalidate_plan_cache
    from pages.models import Page
    from pages.revalidation import revalidate_public_pages

    with transaction.atomic():
        user.username = username
        user.email = email
        user.set_password(password)
        user.is_guest = False
        user.email_verified = False
        revoke_all_sessions(user)
        user.save()

        free_plan = Plan.objects.filter(name='free', is_active=True).first()
        if free_plan is not None:
            Subscription.objects.filter(workspace__owner=user).update(
                plan=free_plan,
                status=Subscription.Status.FREE,
                current_period_end=None,
            )
        else:
            logger.error('No active Free plan: the claimed account %s keeps its subscription', user.pk)

        published_slugs = list(
            Page.objects.filter(owner=user, status=Page.Status.PUBLISHED).values_list('slug', flat=True)
        )
        # The public copies stop being noindex/watermarked-as-guest only once the cache is dropped
        revalidate_public_pages(*published_slugs)

    invalidate_plan_cache(user)
    cache.delete('sitemap_xml')
    return user

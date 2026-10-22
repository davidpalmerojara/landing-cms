"""Every email the app sends goes through `send_capped_email` (ADR-049).

The free email plan sends 300 messages a day and anyone can ask for a magic
link to any address, so sending is guarded:
- a global cap per UTC day (EMAIL_DAILY_LIMIT, below the provider's quota);
- a cap per recipient per UTC day (EMAIL_RECIPIENT_DAILY_LIMIT), whoever asks;
- a failure of the provider (blocked port, timeout, rejected key) is logged and
  raised as `EmailUnavailable` (503 EMAIL_UNAVAILABLE), never a 500, and it is
  not counted, so a failed send does not use up anybody's quota.

Only sent messages are recorded (`SentEmail`), by a hash of the recipient.
"""
import hashlib
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from .messages import message
from .models import SentEmail

logger = logging.getLogger(__name__)

# Backends that print or drop messages instead of delivering them
NON_DELIVERING_BACKENDS = {
    'django.core.mail.backends.console.EmailBackend',
    'django.core.mail.backends.dummy.EmailBackend',
}
DISABLED_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'
# How long sent-email rows are kept: enough for the daily caps and the share dedupe
SENT_EMAIL_RETENTION = timedelta(days=30)


class EmailUnavailable(APIException):
    """Email cannot be sent right now: off in this deployment, the daily cap is reached, or the provider failed."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'EMAIL_UNAVAILABLE'

    def __init__(self):
        super().__init__(detail={'error': message('email_unavailable'), 'code': 'EMAIL_UNAVAILABLE'})


class RecipientLimitReached(Exception):
    """This address already got its emails for today. Callers answer as if it was sent."""


def email_enabled() -> bool:
    """False when the deployment turned email off (the dummy backend): magic links answer 503 at once."""
    return settings.EMAIL_BACKEND != DISABLED_BACKEND


def recipient_hash(address: str) -> str:
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()


def _start_of_day():
    return timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)


def sent_today() -> int:
    return SentEmail.objects.filter(created_at__gte=_start_of_day()).count()


def sent_to_today(address: str) -> int:
    return SentEmail.objects.filter(recipient_hash=recipient_hash(address), created_at__gte=_start_of_day()).count()


def share_notice_sent(address: str, page_id) -> bool:
    """A share notice for this page already went to this address (within the retention window)."""
    return SentEmail.objects.filter(
        kind=SentEmail.Kind.SHARE, recipient_hash=recipient_hash(address), page_id=page_id,
    ).exists()


def check_can_send(address: str) -> None:
    """Raise before doing any work that only makes sense if the email can go out.

    EmailUnavailable: email is off or the global cap is reached (logged loudly).
    RecipientLimitReached: this address had enough emails today.
    """
    if not email_enabled():
        raise EmailUnavailable()
    if sent_today() >= settings.EMAIL_DAILY_LIMIT:
        logger.error('Daily email limit reached (%s): nothing more is sent until 00:00 UTC', settings.EMAIL_DAILY_LIMIT)
        raise EmailUnavailable()
    if sent_to_today(address) >= settings.EMAIL_RECIPIENT_DAILY_LIMIT:
        logger.warning('Email not sent: the address reached its daily limit of %s', settings.EMAIL_RECIPIENT_DAILY_LIMIT)
        raise RecipientLimitReached()


def send_capped_email(*, kind: str, to: str, subject: str, text: str, html: str, page_id=None) -> None:
    """Send one email under the caps. Raises EmailUnavailable or RecipientLimitReached, never anything else."""
    check_can_send(to)
    try:
        send_mail(
            subject=subject,
            message=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to],
            html_message=html,
            fail_silently=False,
        )
    except Exception:
        # The provider's own errors (smtplib, sockets, HTTP) have no common base:
        # whatever it was, the request answers 503 and nothing is counted
        logger.error('Sending a %s email failed', kind, exc_info=True)
        raise EmailUnavailable() from None
    SentEmail.objects.create(kind=kind, recipient_hash=recipient_hash(to), page_id=page_id)


def prune_sent_emails() -> int:
    """Delete the records older than the retention window. For the daily maintenance job."""
    deleted, _ = SentEmail.objects.filter(created_at__lt=timezone.now() - SENT_EMAIL_RETENTION).delete()
    return deleted

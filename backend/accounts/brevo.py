"""Email backend that sends through Brevo's HTTPS API (ADR-050).

Render's free web services cannot open outgoing SMTP connections (ports 25,
465 and 587 are blocked), so production sends with one HTTPS request per
message instead. Set EMAIL_BACKEND=accounts.brevo.BrevoEmailBackend and
BREVO_API_KEY (the API key of the Brevo account, not an SMTP key). The sender
in DEFAULT_FROM_EMAIL must be a sender verified in Brevo.
"""
import logging
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email'


class BrevoError(Exception):
    """Brevo did not accept the message."""


def _address(value: str) -> dict:
    name, email = parseaddr(value)
    return {'email': email, 'name': name} if name else {'email': email}


def brevo_payload(email_message) -> dict:
    """The JSON body Brevo's transactional endpoint takes, from a Django EmailMessage."""
    payload = {
        'sender': _address(email_message.from_email or settings.DEFAULT_FROM_EMAIL),
        'to': [_address(recipient) for recipient in email_message.to],
        'subject': email_message.subject,
        'textContent': email_message.body,
    }
    for content, mimetype in getattr(email_message, 'alternatives', None) or []:
        if mimetype == 'text/html':
            payload['htmlContent'] = content
    return payload


class BrevoEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, api_key=None, timeout=None, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = api_key or settings.BREVO_API_KEY
        self.timeout = timeout or settings.EMAIL_TIMEOUT

    def send_messages(self, email_messages) -> int:
        sent = 0
        for email_message in email_messages:
            try:
                self._send(email_message)
            except (requests.RequestException, BrevoError):
                if not self.fail_silently:
                    raise
                logger.warning('Brevo did not send a message', exc_info=True)
                continue
            sent += 1
        return sent

    def _send(self, email_message) -> None:
        if not self.api_key:
            raise BrevoError('BREVO_API_KEY is not set')
        response = requests.post(
            BREVO_SEND_URL,
            json=brevo_payload(email_message),
            headers={'api-key': self.api_key, 'accept': 'application/json'},
            timeout=self.timeout,
        )
        if response.status_code >= 300:
            # Brevo's error body names the problem (bad key, unverified sender, quota): log it, no secrets in it
            raise BrevoError(f'Brevo answered {response.status_code}: {response.text[:300]}')

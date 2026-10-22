"""System checks for the email settings (ADR-050).

Registered without `deploy=True`, like paxl.E001: `manage.py check`, `migrate`
and the Daphne start (config/asgi.py) refuse to run with these errors.
"""
from django.conf import settings
from django.core.checks import Error, Tags, register

CONSOLE_BACKEND = 'django.core.mail.backends.console.EmailBackend'
BREVO_BACKEND = 'accounts.brevo.BrevoEmailBackend'


@register(Tags.security)
def check_email_backend(app_configs, **kwargs):
    if settings.DEBUG:
        return []
    if settings.EMAIL_BACKEND == CONSOLE_BACKEND:
        # A magic link is a sign-in credential: printed, it would sit in the host's logs
        return [Error(
            'EMAIL_BACKEND is the console backend while DEBUG is off.',
            hint=(
                f'Set EMAIL_BACKEND={BREVO_BACKEND} with BREVO_API_KEY to send email, or '
                'EMAIL_BACKEND=django.core.mail.backends.dummy.EmailBackend to turn email off '
                '(magic links then answer 503 EMAIL_UNAVAILABLE).'
            ),
            id='paxl.E004',
        )]
    if settings.EMAIL_BACKEND == BREVO_BACKEND and not settings.BREVO_API_KEY:
        return [Error(
            'EMAIL_BACKEND is Brevo but BREVO_API_KEY is empty.',
            hint='Set BREVO_API_KEY to the API key of the Brevo account (Settings > SMTP & API > API keys).',
            id='paxl.E005',
        )]
    return []

"""Messages of the accounts app in the language the client asked for.

`LocaleMiddleware` reads Accept-Language (the frontend sends its UI locale);
Django and DRF translate their own messages, and the few custom ones live here.
"""
from django.utils.translation import get_language

_MESSAGES = {
    'email_taken': {
        'es': 'Ya existe una cuenta con este email.',
        'en': 'An account with this email already exists.',
    },
    'username_taken': {
        'es': 'Ese nombre de usuario ya está en uso.',
        'en': 'That username is already taken.',
    },
    'real_email': {
        'es': 'Usa un email real.',
        'en': 'Use a real email address.',
    },
    'passwords_differ': {
        'es': 'Las contraseñas no coinciden.',
        'en': 'The passwords do not match.',
    },
    'magic_sent': {
        'es': 'Si el email existe, recibirás un enlace de acceso.',
        'en': 'If the email exists, you will get a sign-in link.',
    },
    'magic_subject': {
        'es': 'Tu enlace de acceso a Paxl',
        'en': 'Your Paxl sign-in link',
    },
    'magic_text': {
        'es': 'Haz clic en el siguiente enlace para iniciar sesión:\n\n{url}\n\nEste enlace expira en 15 minutos.',
        'en': 'Click the link below to sign in:\n\n{url}\n\nThis link expires in 15 minutes.',
    },
    'magic_html_intro': {
        'es': 'Haz clic en el siguiente enlace para iniciar sesión en Paxl:',
        'en': 'Click the link below to sign in to Paxl:',
    },
    'magic_html_button': {
        'es': 'Iniciar sesión',
        'en': 'Sign in',
    },
    'magic_html_outro': {
        'es': 'Este enlace expira en 15 minutos. Si no solicitaste este acceso, ignora este correo.',
        'en': 'This link expires in 15 minutes. If you did not request this, ignore this email.',
    },
}


def message(key: str, **values: str) -> str:
    """The message in the active language (Spanish when it is neither es nor en)."""
    language = (get_language() or 'es')[:2]
    variants = _MESSAGES[key]
    text = variants.get(language, variants['es'])
    return text.format(**values) if values else text

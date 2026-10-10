"""Custom DRF exception handler that standardizes error responses."""

import logging

from django.conf import settings
from django.utils.translation import get_language
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

# Map HTTP status codes to stable error codes for the frontend.
_STATUS_TO_CODE = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    429: 'THROTTLED',
}


# The envelope's own texts, in the language of the request (LocaleMiddleware reads
# Accept-Language; DRF already translates its field messages and the throttle text).
# The frontend picks what to show by `code`; these are for any other client and logs.
_ENVELOPE_TEXTS = {
    'internal': {'es': 'Error interno del servidor.', 'en': 'Internal server error.'},
    'not_found': {'es': 'Recurso no encontrado.', 'en': 'Resource not found.'},
    'validation': {'es': 'Error de validación.', 'en': 'Validation error.'},
}


def _text(key: str) -> str:
    language = (get_language() or 'es')[:2]
    variants = _ENVELOPE_TEXTS[key]
    return variants.get(language, variants['es'])


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return None

    status_code = response.status_code

    # DRF validation errors come as dicts/lists — keep them as `details`
    # but wrap in the standard envelope so the frontend always gets
    # { error: string, code: string } at the top level.
    if isinstance(response.data, dict) and 'error' in response.data:
        # Already in our format (manually returned by views).
        if 'code' not in response.data:
            response.data['code'] = _STATUS_TO_CODE.get(status_code, 'ERROR')
        return response

    if not settings.DEBUG and status_code >= 500:
        logger.error(
            'Unhandled %s in %s: %s',
            type(exc).__name__,
            context.get('view'),
            exc,
            exc_info=True,
        )
        response.data = {
            'error': _text('internal'),
            'code': 'INTERNAL_ERROR',
        }
    elif status_code == 404:
        response.data = {
            'error': _text('not_found'),
            'code': 'NOT_FOUND',
        }
    elif isinstance(response.data, dict):
        # DRF validation errors — keep detail fields, add envelope
        detail = response.data.get('detail', '')
        if detail:
            response.data = {
                'error': str(detail),
                'code': _STATUS_TO_CODE.get(status_code, 'ERROR'),
            }
        else:
            # Field-level errors: { field: [messages] }
            response.data = {
                'error': _text('validation'),
                'code': _STATUS_TO_CODE.get(status_code, 'VALIDATION_ERROR'),
                'details': response.data,
            }

    return response

"""Optional features of a deployment (ADR-027, ADR-031).

Some features need infrastructure the free demo hosting does not have. Each one
sits behind a setting; the frontend asks GET /api/features/ what is on and
hides the rest, and the endpoints of a disabled feature answer FEATURE_DISABLED
(404 for custom domains, 503 for billing).
"""
import logging

from django.conf import settings
from rest_framework import permissions
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import APIException
from rest_framework.response import Response

logger = logging.getLogger(__name__)

STRIPE_TEST_KEY_PREFIXES = ('sk_test_', 'rk_test_')
STRIPE_LIVE_KEY_PREFIXES = ('sk_live_', 'rk_live_')


class FeatureDisabled(APIException):
    """The endpoint exists, but the deployment has the feature turned off."""
    status_code = 404
    default_detail = 'Esta función no está disponible en este servidor.'
    default_code = 'FEATURE_DISABLED'

    def __init__(self, detail=None):
        super().__init__(detail={'error': str(detail or self.default_detail), 'code': self.default_code})


class BillingDisabled(FeatureDisabled):
    """Payments are not active in this deployment (no Stripe test key): 503, not a server error."""
    status_code = 503
    default_detail = 'Los pagos no están activos en esta demo.'


def custom_domains_enabled() -> bool:
    return bool(settings.CUSTOM_DOMAINS_ENABLED)


def stripe_key_is_live(key: str) -> bool:
    return key.startswith(STRIPE_LIVE_KEY_PREFIXES)


def billing_enabled() -> bool:
    """Billing runs only with a Stripe TEST key (D2): the demo never takes real payments.

    No key means billing is off. A live key (`sk_live_…`) is refused: billing
    stays off and the problem is logged (the system check `paxl.E002` also
    stops `manage.py` commands, so a deploy with a live key does not go out).
    """
    key = settings.STRIPE_SECRET_KEY
    if not key:
        return False
    if stripe_key_is_live(key):
        logger.error('STRIPE_SECRET_KEY is a live key: billing is disabled. Use a test key (sk_test_…).')
        return False
    return key.startswith(STRIPE_TEST_KEY_PREFIXES)


class CustomDomainsEnabled(permissions.BasePermission):
    """Put first in permission_classes: with the feature off nothing else is evaluated."""

    def has_permission(self, request, view):
        if not custom_domains_enabled():
            raise FeatureDisabled()
        return True


class BillingEnabled(permissions.BasePermission):
    """Put first in permission_classes: without a Stripe test key checkout, portal and webhook answer 503."""

    def has_permission(self, request, view):
        if not billing_enabled():
            raise BillingDisabled()
        return True


@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def features_view(request):
    """GET /api/features/ — which optional features this deployment offers."""
    return Response({
        'custom_domains': custom_domains_enabled(),
        'billing': billing_enabled(),
    })

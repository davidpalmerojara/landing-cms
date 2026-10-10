"""Optional features of a deployment (ADR-025).

Some features need infrastructure the free demo hosting does not have. Each one
sits behind a setting; the frontend asks GET /api/features/ what is on and
hides the rest, and the endpoints of a disabled feature answer 404 FEATURE_DISABLED.
"""
from django.conf import settings
from rest_framework import permissions
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import APIException
from rest_framework.response import Response


class FeatureDisabled(APIException):
    """The endpoint exists, but the deployment has the feature turned off."""
    status_code = 404
    default_detail = 'Esta función no está disponible en este servidor.'
    default_code = 'FEATURE_DISABLED'

    def __init__(self, detail=None):
        super().__init__(detail={'error': str(detail or self.default_detail), 'code': self.default_code})


def custom_domains_enabled() -> bool:
    return bool(settings.CUSTOM_DOMAINS_ENABLED)


class CustomDomainsEnabled(permissions.BasePermission):
    """Put first in permission_classes: with the feature off nothing else is evaluated."""

    def has_permission(self, request, view):
        if not custom_domains_enabled():
            raise FeatureDisabled()
        return True


@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def features_view(request):
    """GET /api/features/ — which optional features this deployment offers."""
    return Response({'custom_domains': custom_domains_enabled()})

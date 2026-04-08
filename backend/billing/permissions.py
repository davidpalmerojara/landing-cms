"""
Plan-based permission checking for DRF views.

Usage in views:
    class MyView(PlanPermissionMixin, APIView):
        def get(self, request, ...):
            plan = self.get_plan(request)
            ...

    # Or use the helper directly:
    from billing.permissions import get_user_plan, check_plan_limit

    plan = get_user_plan(request.user)
    check_plan_limit(plan, 'has_analytics')  # raises PlanLimitExceeded if denied
"""

import logging

from django.core.cache import cache
from rest_framework.exceptions import APIException
from rest_framework import status as http_status

from pages.models import Page

logger = logging.getLogger(__name__)

# Cache TTL for plan lookups (seconds)
PLAN_CACHE_TTL = 300  # 5 minutes


class PlanLimitExceeded(APIException):
    """Raised when a user exceeds their plan's limits."""
    status_code = http_status.HTTP_403_FORBIDDEN
    default_detail = 'Plan limit exceeded.'
    default_code = 'plan_limit'

    def __init__(self, message: str, upgrade_url: str = '/settings/billing'):
        super().__init__(detail={
            'error': 'plan_limit',
            'message': message,
            'upgrade_url': upgrade_url,
        })


def get_user_plan(user):
    """
    Get the active Plan for a user, using cache.

    Lookup chain: user → pages (owner) → workspace → subscription → plan.
    Since Pages don't always have a workspace, we also check for a direct
    Subscription via any of the user's workspaces.

    Returns the Plan object, or a default Free-like dict if none found.
    """
    if not user or not user.is_authenticated:
        return _free_plan_fallback()

    cache_key = f'user_plan:{user.pk}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    from billing.models import Plan, Subscription

    # Try to find subscription via user's workspaces
    sub = (
        Subscription.objects
        .filter(workspace__owner=user)
        .select_related('plan')
        .first()
    )

    if sub and sub.plan:
        plan = sub.plan
    else:
        # Fallback to Free plan
        plan = Plan.objects.filter(name='free', is_active=True).first()
        if not plan:
            return _free_plan_fallback()

    # For paid subs, check if actually active
    if sub and not sub.is_paid and sub.status != Subscription.Status.FREE:
        # Subscription exists but is canceled/past_due — use free limits
        plan = Plan.objects.filter(name='free', is_active=True).first() or _free_plan_fallback()

    cache.set(cache_key, plan, PLAN_CACHE_TTL)
    return plan


def get_user_subscription(user):
    """Get the Subscription object for a user (uncached)."""
    from billing.models import Subscription

    if not user or not user.is_authenticated:
        return None

    return (
        Subscription.objects
        .filter(workspace__owner=user)
        .select_related('plan')
        .first()
    )


def invalidate_plan_cache(user):
    """Clear the cached plan for a user (call after subscription changes)."""
    cache.delete(f'user_plan:{user.pk}')


def _free_plan_fallback():
    """Return a fake plan object with Free limits when no Plan exists in DB."""

    class FreePlanFallback:
        name = 'free'
        display_name = 'Free'
        max_pages = 3
        max_ai_generations_per_hour = 0
        has_analytics = False
        has_collaboration = False
        has_custom_domain = False
        has_ab_testing = False
        remove_watermark = False
        max_version_history = 5

    return FreePlanFallback()


def check_page_limit(user):
    """Check if the user can create another page. Raises PlanLimitExceeded if not."""
    plan = get_user_plan(user)
    if plan.max_pages == -1:
        return  # unlimited

    current_count = Page.objects.filter(owner=user).count()
    if current_count >= plan.max_pages:
        raise PlanLimitExceeded(
            f'Tu plan {plan.display_name} permite un máximo de {plan.max_pages} páginas. '
            f'Actualiza a Pro para crear páginas ilimitadas.'
        )


def check_feature(user, feature_attr: str, feature_label: str):
    """Check if a boolean feature is enabled on the user's plan."""
    plan = get_user_plan(user)
    if not getattr(plan, feature_attr, False):
        raise PlanLimitExceeded(
            f'{feature_label} está disponible en el plan Pro. '
            f'Actualiza para desbloquear esta funcionalidad.'
        )


class PlanPermissionMixin:
    """
    Mixin for DRF views that need plan-based permission checks.

    Provides self.get_plan(request) and self.check_feature(request, attr, label).
    """

    def get_plan(self, request):
        return get_user_plan(request.user)

    def check_feature(self, request, feature_attr: str, feature_label: str):
        check_feature(request.user, feature_attr, feature_label)

    def check_page_limit(self, request):
        check_page_limit(request.user)

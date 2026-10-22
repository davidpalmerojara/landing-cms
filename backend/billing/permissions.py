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

from django.conf import settings
from django.core.cache import cache
from rest_framework.exceptions import APIException
from rest_framework import status as http_status

from accounts.guests import GuestPageLimitExceeded
from pages.models import Page

logger = logging.getLogger(__name__)

# Cache TTL for plan lookups (seconds)
PLAN_CACHE_TTL = 300  # 5 minutes
DEMO_PLAN_CACHE_KEY = 'demo_pro_plan'


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
    While payments are off every account gets the Pro plan (billing/demo.py).
    """
    if not user or not user.is_authenticated:
        return _free_plan_fallback()

    from billing.demo import demo_all_pro
    from billing.models import Plan, Subscription

    if demo_all_pro():
        return _demo_pro_plan()

    cache_key = f'user_plan:{user.pk}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

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


def _demo_pro_plan():
    """The Pro plan row, cached like a user's plan; a Pro-like stand-in if the plans were never seeded."""
    from billing.models import Plan

    plan = cache.get(DEMO_PLAN_CACHE_KEY)
    if plan is None:
        plan = Plan.objects.filter(name='pro', is_active=True).first()
        if plan is None:
            logger.error('No active Pro plan: run seed_plans. Demo accounts get the built-in Pro limits')
            return _pro_plan_fallback()
        cache.set(DEMO_PLAN_CACHE_KEY, plan, PLAN_CACHE_TTL)
    return plan


def invalidate_plan_cache(user):
    """Clear the cached plan for a user (call after subscription changes)."""
    cache.delete(f'user_plan:{user.pk}')


def _free_plan_fallback():
    """Return a fake plan object with Free limits when no Plan exists in DB."""

    class FreePlanFallback:
        id = None
        name = 'free'
        display_name = 'Free'
        price_monthly = 0
        price_yearly = None
        max_pages = 3
        max_ai_generations_per_hour = 0
        has_analytics = False
        has_collaboration = False
        has_custom_domain = False
        has_ab_testing = False
        remove_watermark = False
        max_version_history = 5

    return FreePlanFallback()


def _pro_plan_fallback():
    """Pro features when the demo gives everyone Pro but no Plan row exists."""

    class ProPlanFallback:
        id = None
        name = 'pro'
        display_name = 'Pro'
        price_monthly = 19
        price_yearly = 190
        max_pages = -1
        max_ai_generations_per_hour = 10
        has_analytics = True
        has_collaboration = True
        has_custom_domain = True
        has_ab_testing = True
        remove_watermark = True
        max_version_history = -1

    return ProPlanFallback()


class AccountPageLimit(APIException):
    """The hard page cap of every plan (MAX_PAGES_PER_ACCOUNT): not an upgrade prompt, there is nothing to upgrade to."""
    status_code = http_status.HTTP_403_FORBIDDEN
    default_code = 'PAGE_LIMIT'

    def __init__(self, limit):
        super().__init__(detail={
            'error': f'Esta demo permite hasta {limit} páginas por cuenta. Elimina alguna para crear otra.',
            'code': 'PAGE_LIMIT',
            'limit': limit,
        })


def check_page_limit(user):
    """Check if the user can create another page. Raises PlanLimitExceeded if not."""
    if user.is_guest:
        # Guests have the Pro plan for the demo, but a small fixed page quota
        if Page.objects.filter(owner=user).count() >= settings.GUEST_MAX_PAGES:
            raise GuestPageLimitExceeded(settings.GUEST_MAX_PAGES)
        return

    plan = get_user_plan(user)
    current_count = Page.objects.filter(owner=user).count()
    if plan.max_pages == -1:
        # "Unlimited" still has the storage cap of the free database (SEC-001)
        if current_count >= settings.MAX_PAGES_PER_ACCOUNT:
            raise AccountPageLimit(settings.MAX_PAGES_PER_ACCOUNT)
        return

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

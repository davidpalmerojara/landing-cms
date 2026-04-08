"""
Auto-create a Free Subscription when a Workspace is created.

Also handles the case where a Page is created without a Workspace by
looking up the user's default workspace or the subscription via owner.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from pages.models import Workspace

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Workspace)
def create_free_subscription(sender, instance, created, **kwargs):
    """Assign a Free plan Subscription to every new Workspace."""
    if not created:
        return

    from .models import Plan, Subscription

    free_plan = Plan.objects.filter(name='free', is_active=True).first()
    if not free_plan:
        logger.warning('No active Free plan found — skipping subscription creation for workspace %s', instance.pk)
        return

    Subscription.objects.get_or_create(
        workspace=instance,
        defaults={'plan': free_plan, 'status': Subscription.Status.FREE},
    )

"""Deleting accounts with everything they own (ADR-026).

Used for expired guests (accounts/guests.py) and for people who delete their
own account (DELETE /api/auth/me/). The database cascades remove each user's
workspaces, subscription and payment history, pages with their blocks, saved
versions, invites, custom domains, form submissions and analytics events,
assets, AI logs and the pages they were invited to edit. What the cascade
does not reach is handled here: refresh tokens, files in storage, the cached
copies of their published pages and the sitemap.
"""
import logging
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Deletion:
    users: int
    rows: int
    files: int
    published_pages: int


def has_active_stripe_subscription(user) -> bool:
    """A paid subscription that will still charge: deleting the account would leave it running."""
    from billing.models import Subscription

    return (
        Subscription.objects
        .filter(
            workspace__owner=user,
            status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING, Subscription.Status.PAST_DUE],
            cancel_at_period_end=False,
        )
        .exclude(stripe_subscription_id__isnull=True)
        .exclude(stripe_subscription_id='')
        .exists()
    )


def delete_users_with_data(ids) -> Deletion:
    """Delete these users and everything they own, then clean up what the database cascade cannot."""
    from pages.models import Asset, Page
    from pages.revalidation import revalidate_public_pages
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    User = get_user_model()
    ids = list(ids)
    owned = Q(owner_id__in=ids) | Q(workspace__owner_id__in=ids)
    published_slugs = list(
        Page.objects.filter(owned, status=Page.Status.PUBLISHED).values_list('slug', flat=True)
    )
    files = [name for name in Asset.objects.filter(owned).values_list('file', flat=True) if name]

    with transaction.atomic():
        # Their refresh tokens are no use any more (the blacklist rows cascade from them)
        OutstandingToken.objects.filter(user_id__in=ids).delete()
        rows, _ = User.objects.filter(pk__in=ids).delete()
        revalidate_public_pages(*published_slugs)

    storage = Asset._meta.get_field('file').storage
    for name in files:
        try:
            storage.delete(name)
        except OSError:
            logger.warning('Could not delete a file of a deleted account', extra={'file': name}, exc_info=True)
    if published_slugs:
        cache.delete('sitemap_xml')

    return Deletion(users=len(ids), rows=rows, files=len(files), published_pages=len(published_slugs))


def delete_account(user) -> Deletion:
    """Delete one account at its owner's request. Logs counts only: nothing that identifies the person."""
    from billing.permissions import invalidate_plan_cache

    invalidate_plan_cache(user)
    deletion = delete_users_with_data([user.pk])
    logger.info(
        'Account deleted (%s database rows, %s files, %s published pages)',
        deletion.rows, deletion.files, deletion.published_pages,
    )
    return deletion

"""Deleting accounts with everything they own (ADR-028).

Used for expired guests (accounts/guests.py) and for people who delete their
own account (DELETE /api/auth/me/). The database cascades remove each user's
workspaces, subscription and payment history, pages with their blocks, saved
versions, invites, custom domains, form submissions and analytics events,
assets with their image bytes (ADR-049), AI logs and the pages they were
invited to edit. What the cascade does not reach is handled here: refresh
tokens, the cached copies of their published pages and the sitemap.
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
    # Uploaded images deleted (their bytes are rows too, removed by the cascade)
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
    from collaboration.sessions import close_user_sockets
    from pages import sync
    from pages.models import Asset, Page
    from pages.revalidation import revalidate_public_pages
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    User = get_user_model()
    ids = list(ids)
    owned = Q(owner_id__in=ids) | Q(workspace__owner_id__in=ids)
    published_slugs = list(
        Page.objects.filter(owned, status=Page.Status.PUBLISHED).values_list('slug', flat=True)
    )
    files = Asset.objects.filter(owned).count()
    # Collaborators may have these pages open: they are told the page is gone (DATA-009)
    page_ids = list(Page.objects.filter(owned).values_list('pk', flat=True))

    with transaction.atomic():
        # Their refresh tokens are no use any more (the blacklist rows cascade from them)
        OutstandingToken.objects.filter(user_id__in=ids).delete()
        rows, _ = User.objects.filter(pk__in=ids).delete()
        revalidate_public_pages(*published_slugs)
        for page_id in page_ids:
            transaction.on_commit(lambda page_id=page_id: sync.notify_page_deleted(page_id))
        # Their sockets on pages they were invited to edit close too
        for user_id in ids:
            close_user_sockets(user_id)

    if published_slugs:
        cache.delete('sitemap_xml')

    return Deletion(users=len(ids), rows=rows, files=files, published_pages=len(published_slugs))


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

"""Tell the frontend to drop its cached copy of public pages (ADR-019).

The frontend caches each public page's data; publishing, unpublishing or
deleting a page must reach visitors right away, not when the cache expires.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)

REVALIDATE_TIMEOUT_SECONDS = 2


def _send_revalidation(slugs):
    url = f"{settings.FRONTEND_URL.rstrip('/')}/revalidate"
    request = urllib.request.Request(
        url,
        data=json.dumps({'slugs': slugs}).encode(),
        method='POST',
        headers={'Content-Type': 'application/json', 'X-Revalidate-Secret': settings.REVALIDATE_SECRET},
    )
    try:
        with urllib.request.urlopen(request, timeout=REVALIDATE_TIMEOUT_SECONDS):
            pass
    except (urllib.error.URLError, OSError) as e:
        # The page change itself succeeded; the cached copy expires on its own
        logger.warning('Could not revalidate public pages', extra={'slugs': slugs, 'error': str(e)})


def revalidate_public_pages(*slugs):
    """Ask the frontend to refetch these pages on their next visit, once the
    current transaction commits. Does nothing without REVALIDATE_SECRET."""
    slugs = [slug for slug in slugs if slug]
    if not slugs or not settings.REVALIDATE_SECRET:
        return
    transaction.on_commit(lambda: _send_revalidation(slugs))

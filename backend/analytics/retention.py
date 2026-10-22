"""How long analytics events are kept, and how many a page takes per day (DATA-002, PERF-004).

The collect endpoint is public: without limits one IP could add 5,000 rows a
minute to the 0.5 GB database, and honest traffic alone grows it forever.
- `prune_old_events()` deletes events older than ANALYTICS_RETENTION_DAYS. The
  daily maintenance job calls it (contract with the deploy batch).
- `page_daily_room()` says how many more events a page accepts today
  (ANALYTICS_PAGE_DAILY_LIMIT per UTC day); past it new events are dropped.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import AnalyticsEvent

logger = logging.getLogger(__name__)

PRUNE_BATCH_SIZE = 5000


def retention_cutoff():
    return timezone.now() - timedelta(days=settings.ANALYTICS_RETENTION_DAYS)


def prune_old_events(batch_size: int = PRUNE_BATCH_SIZE) -> int:
    """Delete events older than the retention window, in batches; returns how many."""
    cutoff = retention_cutoff()
    deleted_total = 0
    while True:
        ids = list(
            AnalyticsEvent.objects.filter(created_at__lt=cutoff).values_list('pk', flat=True)[:batch_size]
        )
        if not ids:
            break
        deleted, _ = AnalyticsEvent.objects.filter(pk__in=ids).delete()
        deleted_total += deleted
    if deleted_total:
        logger.info('Pruned %s analytics events older than %s days', deleted_total, settings.ANALYTICS_RETENTION_DAYS)
    return deleted_total


def page_daily_room(page_id) -> int:
    """Events this page can still take today (UTC)."""
    start_of_day = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today = AnalyticsEvent.objects.filter(page_id=page_id, created_at__gte=start_of_day).count()
    return max(settings.ANALYTICS_PAGE_DAILY_LIMIT - today, 0)

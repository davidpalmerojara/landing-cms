import logging
import sys
from datetime import timedelta, timezone as dt_timezone

from django.db.models import Avg, Count, FloatField, Max, Value
from django.db.models.fields.json import KT
from django.db.models.functions import Cast, Least, TruncDate, TruncHour, TruncWeek
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from pages.models import Page, pages_accessible_to
from .models import AnalyticsEvent
from .privacy import MAX_SECONDS_ON_PAGE, daily_visitor_hash, referrer_origin, sanitize_event_data
from .retention import page_daily_room
from .serializers import EventBatchSerializer

logger = logging.getLogger(__name__)


class AnalyticsCollectThrottle(AnonRateThrottle):
    # A visitor sends a batch every 10 s at most; 30 a minute is plenty (DATA-002)
    rate = '30/min'
    # Its own bucket: with the default scope ('anon') it shared a history with every
    # other anonymous endpoint behind the same IP
    scope = 'analytics'


class CollectView(APIView):
    """
    POST /api/analytics/collect/

    Public endpoint that receives batched analytics events from the tracking pixel.
    Validates that the page exists and is published, then bulk-creates events.
    Returns 204 No Content for minimal latency.

    For high-volume production, replace bulk_create with a Redis queue
    consumed by a Celery worker for async writes.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnalyticsCollectThrottle]

    def post(self, request):
        serializer = EventBatchSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        page_id = data['page_id']

        # Verify the page exists and is published
        try:
            page = Page.objects.only('id', 'status').get(pk=page_id)
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if page.status != Page.Status.PUBLISHED:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Past the page's daily cap new events are dropped, silently: the tracker
        # has nothing to do about it and the database stays bounded (DATA-002)
        room = page_daily_room(page.pk)
        if room == 0:
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Cookieless visitor id: computed here, never sent by the browser.
        visitor_id = daily_visitor_hash(request, page.pk)

        # Build event objects, dated now whatever the tracker says (SEC-001)
        now = timezone.now()
        event_objects = []
        for evt in data['events'][:room]:
            event_objects.append(AnalyticsEvent(
                page=page,
                visitor_id=visitor_id,
                event_type=evt['event_type'],
                block_id=evt.get('block_id'),
                block_type=evt.get('block_type'),
                event_data=sanitize_event_data(evt['event_type'], evt.get('event_data')),
                referrer=referrer_origin(evt.get('referrer')),
                screen_size=evt.get('screen_size') or None,
                utm_source=evt.get('utm_source') or None,
                utm_medium=evt.get('utm_medium') or None,
                utm_campaign=evt.get('utm_campaign') or None,
                created_at=now,
            ))

        # Bulk insert — for production scale, enqueue to Celery instead
        try:
            AnalyticsEvent.objects.bulk_create(event_objects)
        except Exception:
            logger.exception('Failed to bulk_create analytics events')
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(status=status.HTTP_204_NO_CONTENT)


# A custom range covers at most a year, between these years (so the previous
# period, computed for the trend, can never fall off the calendar)
MAX_CUSTOM_RANGE = timedelta(days=366)
EARLIEST_YEAR = 2000
LATEST_YEAR = 2100


class InvalidPeriod(Exception):
    """The custom range cannot be read, is reversed or is too long."""


def _parse_moment(value):
    """An aware datetime from an ISO string; None if it is not one (SEC-008:
    month 13, year 1 and naive values used to answer 500)."""
    try:
        moment = parse_datetime(value)
    except (ValueError, OverflowError):
        return None
    if moment is None:
        return None
    if timezone.is_naive(moment):
        moment = moment.replace(tzinfo=dt_timezone.utc)
    if not EARLIEST_YEAR <= moment.year <= LATEST_YEAR:
        return None
    return moment


def _parse_period(period_str, custom_start=None, custom_end=None):
    """Parse period string into (start_date, end_date) datetimes. Raises InvalidPeriod."""
    now = timezone.now()
    if period_str == 'custom' and (custom_start or custom_end):
        start = _parse_moment(custom_start or '')
        end = _parse_moment(custom_end or '')
        if start is None or end is None or start >= end or end - start > MAX_CUSTOM_RANGE:
            raise InvalidPeriod()
        return start, end
    days_map = {'7d': 7, '30d': 30, '90d': 90}
    days = days_map.get(period_str, 30)
    return now - timedelta(days=days), now


def _get_trunc_fn(granularity):
    """Return the appropriate truncation function."""
    if granularity == 'hour':
        return TruncHour
    if granularity == 'week':
        return TruncWeek
    return TruncDate


def _classify_device(screen_size):
    """Classify screen_size string into device category."""
    if not screen_size:
        return 'desktop'
    try:
        width = int(screen_size.split('x')[0])
    except (ValueError, IndexError):
        return 'desktop'
    if width <= 768:
        return 'mobile'
    if width <= 1024:
        return 'tablet'
    return 'desktop'


def _average_time_on_page(events) -> float:
    """Mean over visitors of each one's longest time_on_page.

    Rows written before the collect endpoint clamped values may hold 1e308 or
    a string: numbers are clamped to MAX_SECONDS_ON_PAGE like new ones, and
    anything else is left out instead of breaking the dashboard. The range
    filter does that on both databases: in JSON ordering PostgreSQL puts
    strings below numbers (and booleans above), SQLite puts text above them."""
    seconds = Cast(KT('event_data__seconds'), FloatField())
    per_visitor = (
        events.filter(
            event_type='time_on_page',
            event_data__seconds__gte=0,
            event_data__seconds__lte=sys.float_info.max,
        )
        .values('visitor_id')
        .annotate(longest=Max(Least(seconds, Value(float(MAX_SECONDS_ON_PAGE)))))
    )
    average = per_visitor.aggregate(average=Avg('longest'))['average']
    return round(average, 1) if average is not None else 0.0


SCROLL_DEPTHS = (25, 50, 75, 100)


def _scroll_distribution(events) -> dict[int, int]:
    distribution = {depth: 0 for depth in SCROLL_DEPTHS}
    rows = (
        events.filter(event_type='scroll_depth')
        .values(depth=KT('event_data__depth'))
        .annotate(visitors=Count('visitor_id', distinct=True))
    )
    for row in rows:
        try:
            depth = int(float(row['depth']))
        except (TypeError, ValueError):
            continue
        if depth in distribution:
            distribution[depth] += row['visitors']
    return distribution


class PageAnalyticsView(APIView):
    """
    GET /api/pages/{page_id}/analytics/

    Authenticated endpoint returning aggregated analytics for a page.
    Only accessible by the page owner or collaborators.

    Query params:
        period: 7d | 30d | 90d | custom (default: 30d)
        granularity: hour | day | week (default: day)
        start: ISO datetime (for custom period)
        end: ISO datetime (for custom period)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, page_id):
        from billing.permissions import check_feature

        # Verify ownership or collaboration (distinct: the collaborators join repeats the page)
        page = pages_accessible_to(request.user).filter(pk=page_id).first()
        if page is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Analytics is a feature of the page owner's plan, like collaboration: a
        # collaborator on a Pro owner's page sees them whatever their own plan (ADR-032, SEC2-008)
        check_feature(page.owner, 'has_analytics', 'Analíticas')

        # Parse query params
        period = request.query_params.get('period', '30d')
        granularity = request.query_params.get('granularity', 'day')
        try:
            start_date, end_date = _parse_period(
                period,
                request.query_params.get('start'),
                request.query_params.get('end'),
            )
        except InvalidPeriod:
            return Response(
                {'error': 'El periodo personalizado no es válido (fechas ISO, como mucho un año).', 'code': 'INVALID_PERIOD'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Also compute previous period for trend comparison
        period_duration = end_date - start_date
        prev_start = start_date - period_duration
        prev_end = start_date

        # Base queryset for current period
        qs = AnalyticsEvent.objects.filter(
            page=page,
            created_at__gte=start_date,
            created_at__lte=end_date,
        )

        # Previous period queryset
        prev_qs = AnalyticsEvent.objects.filter(
            page=page,
            created_at__gte=prev_start,
            created_at__lte=prev_end,
        )

        # ── Key metrics ──────────────────────────────────
        total_views = qs.filter(event_type='pageview').count()
        # Distinct daily hashes: a visitor returning on another day counts again.
        unique_visitors = qs.filter(event_type='pageview').values('visitor_id').distinct().count()

        # Average time on page: the longest time of each visitor, averaged, in SQL (PERF-009)
        avg_time_on_page = _average_time_on_page(qs)

        # Bounce rate: visitors with only 1 pageview and no other interactions
        visitors_with_views = qs.filter(event_type='pageview').values('visitor_id').annotate(
            event_count=Count('id')
        )
        total_visitor_sessions = visitors_with_views.count()
        # A "bounce" = visitor who only had pageview events (no clicks, no scroll past 25%)
        visitors_with_interactions = qs.filter(
            event_type__in=['click', 'cta_conversion', 'scroll_depth']
        ).values('visitor_id').distinct().count()
        bounce_count = max(0, total_visitor_sessions - visitors_with_interactions)
        bounce_rate = round((bounce_count / total_visitor_sessions * 100) if total_visitor_sessions > 0 else 0, 1)

        # CTA conversions
        cta_conversions = qs.filter(event_type='cta_conversion').count()

        # Previous period metrics for trend
        prev_views = prev_qs.filter(event_type='pageview').count()
        prev_unique = prev_qs.filter(event_type='pageview').values('visitor_id').distinct().count()
        prev_cta = prev_qs.filter(event_type='cta_conversion').count()

        # ── Views over time ──────────────────────────────
        TruncFn = _get_trunc_fn(granularity)
        views_over_time = list(
            qs.filter(event_type='pageview')
            .annotate(date=TruncFn('created_at'))
            .values('date')
            .annotate(
                views=Count('id'),
                unique_visitors=Count('visitor_id', distinct=True),
            )
            .order_by('date')
        )
        # Serialize dates
        for item in views_over_time:
            item['date'] = item['date'].isoformat() if item['date'] else None

        # ── Clicks by block ──────────────────────────────
        click_events = qs.filter(event_type__in=['click', 'cta_conversion'])
        clicks_by_block = list(
            click_events
            .values('block_id', 'block_type')
            .annotate(click_count=Count('id'))
            .order_by('-click_count')[:20]
        )
        # Calculate CTR (clicks / total pageviews)
        for item in clicks_by_block:
            item['block_id'] = str(item['block_id']) if item['block_id'] else None
            item['ctr'] = round((item['click_count'] / total_views * 100) if total_views > 0 else 0, 1)

        # ── Scroll depth distribution ────────────────────
        # Unique visitors per depth threshold, counted in SQL (PERF-009)
        scroll_distribution = _scroll_distribution(qs)

        # ── Top referrers ────────────────────────────────
        top_referrers = list(
            qs.filter(event_type='pageview', referrer__isnull=False)
            .exclude(referrer='')
            .values('referrer')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )

        # ── Device breakdown ─────────────────────────────
        # Aggregate from screen_size field
        device_events = (
            qs.filter(event_type='pageview')
            .values('screen_size')
            .annotate(count=Count('visitor_id', distinct=True))
        )
        device_breakdown = {'desktop': 0, 'tablet': 0, 'mobile': 0}
        for item in device_events:
            device = _classify_device(item['screen_size'])
            device_breakdown[device] += item['count']

        return Response({
            'total_views': total_views,
            'unique_visitors': unique_visitors,
            'avg_time_on_page': avg_time_on_page,
            'bounce_rate': bounce_rate,
            'cta_conversions': cta_conversions,
            'prev_total_views': prev_views,
            'prev_unique_visitors': prev_unique,
            'prev_cta_conversions': prev_cta,
            'views_over_time': views_over_time,
            'clicks_by_block': clicks_by_block,
            'scroll_depth_distribution': scroll_distribution,
            'top_referrers': top_referrers,
            'device_breakdown': device_breakdown,
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
            },
        })

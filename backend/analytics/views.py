import logging
from datetime import timedelta

from django.db.models import Count, Q, F, Value, CharField
from django.db.models.functions import TruncDate, TruncHour, TruncWeek
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from pages.models import Page
from .models import AnalyticsEvent
from .serializers import EventBatchSerializer

logger = logging.getLogger(__name__)


class AnalyticsCollectThrottle(AnonRateThrottle):
    rate = '100/min'


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

        # Build event objects
        now = timezone.now()
        event_objects = []
        for evt in data['events']:
            event_objects.append(AnalyticsEvent(
                page=page,
                visitor_id=evt['visitor_id'],
                event_type=evt['event_type'],
                block_id=evt.get('block_id'),
                block_type=evt.get('block_type'),
                event_data=evt.get('event_data', {}),
                referrer=evt.get('referrer') or None,
                user_agent=evt.get('user_agent') or None,
                screen_size=evt.get('screen_size') or None,
                utm_source=evt.get('utm_source') or None,
                utm_medium=evt.get('utm_medium') or None,
                utm_campaign=evt.get('utm_campaign') or None,
                created_at=evt.get('timestamp') or now,
            ))

        # Bulk insert — for production scale, enqueue to Celery instead
        try:
            AnalyticsEvent.objects.bulk_create(event_objects)
        except Exception:
            logger.exception('Failed to bulk_create analytics events')
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(status=status.HTTP_204_NO_CONTENT)


def _parse_period(period_str, custom_start=None, custom_end=None):
    """Parse period string into (start_date, end_date) datetimes."""
    now = timezone.now()
    if period_str == 'custom' and custom_start and custom_end:
        from django.utils.dateparse import parse_datetime
        start = parse_datetime(custom_start)
        end = parse_datetime(custom_end)
        if start and end:
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
        # Check plan allows analytics
        from billing.permissions import check_feature
        check_feature(request.user, 'has_analytics', 'Analíticas')

        # Verify ownership or collaboration
        try:
            page = Page.objects.get(
                Q(pk=page_id) & (Q(owner=request.user) | Q(collaborators=request.user))
            )
        except Page.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Parse query params
        period = request.query_params.get('period', '30d')
        granularity = request.query_params.get('granularity', 'day')
        start_date, end_date = _parse_period(
            period,
            request.query_params.get('start'),
            request.query_params.get('end'),
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
        unique_visitors = qs.filter(event_type='pageview').values('visitor_id').distinct().count()

        # Average time on page: compute in Python to avoid SQLite JSON aggregation issues.
        # For production with PostgreSQL, this could use DB-level aggregation instead.
        time_events = list(
            qs.filter(event_type='time_on_page')
            .values_list('visitor_id', 'event_data')
        )
        visitor_max_time: dict[str, float] = {}
        for vid, edata in time_events:
            seconds = 0.0
            if isinstance(edata, dict):
                seconds = float(edata.get('seconds', 0) or 0)
            elif isinstance(edata, (int, float)):
                seconds = float(edata)
            if seconds > visitor_max_time.get(vid, 0):
                visitor_max_time[vid] = seconds
        if visitor_max_time:
            avg_time_on_page = round(sum(visitor_max_time.values()) / len(visitor_max_time), 1)
        else:
            avg_time_on_page = 0.0

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
        # Compute in Python to avoid SQLite JSON aggregation issues
        scroll_distribution = {25: 0, 50: 0, 75: 0, 100: 0}
        scroll_rows = list(
            qs.filter(event_type='scroll_depth')
            .values_list('visitor_id', 'event_data')
        )
        # Track unique visitors per depth threshold
        depth_visitors: dict[int, set] = {25: set(), 50: set(), 75: set(), 100: set()}
        for vid, edata in scroll_rows:
            depth = edata.get('depth') if isinstance(edata, dict) else None
            if depth in depth_visitors:
                depth_visitors[depth].add(vid)
        for d, visitors in depth_visitors.items():
            scroll_distribution[d] = len(visitors)

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

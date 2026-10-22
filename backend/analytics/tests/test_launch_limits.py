"""Launch review: analytics cannot fill the database (DATA-002, PERF-004), the
dashboard aggregates in SQL (PERF-009) and odd periods are a 400 (SEC-008)."""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status

from analytics.models import AnalyticsEvent
from analytics.retention import prune_old_events
from analytics.views import AnalyticsCollectThrottle
from pages.models import Page
from tests.factories import PageFactory

pytestmark = pytest.mark.django_db
COLLECT = '/api/analytics/collect/'


class ProPlan:
    has_analytics = True


@pytest.fixture
def published(user):
    return PageFactory(owner=user, status=Page.Status.PUBLISHED)


def collect(client, page, events):
    return client.post(COLLECT, {'page_id': str(page.pk), 'events': events}, format='json')


def pageviews(count):
    return [{'event_type': 'pageview'} for _ in range(count)]


def dashboard(client, page, **params):
    with patch('billing.permissions.get_user_plan', return_value=ProPlan()):
        return client.get(f'/api/pages/{page.id}/analytics/', params)


class TestCollectLimits:
    def test_data_002_a_batch_holds_at_most_ten_events(self, api_client, published):
        assert collect(api_client, published, pageviews(10)).status_code == status.HTTP_204_NO_CONTENT
        assert collect(api_client, published, pageviews(11)).status_code == status.HTTP_400_BAD_REQUEST
        assert AnalyticsEvent.objects.count() == 10

    def test_data_002_a_page_takes_at_most_its_daily_events(self, api_client, published, settings):
        settings.ANALYTICS_PAGE_DAILY_LIMIT = 15
        for _ in range(3):
            assert collect(api_client, published, pageviews(10)).status_code == status.HTTP_204_NO_CONTENT
        assert AnalyticsEvent.objects.filter(page=published).count() == 15

    def test_data_002_the_cap_is_per_page(self, api_client, published, user, settings):
        settings.ANALYTICS_PAGE_DAILY_LIMIT = 5
        other = PageFactory(owner=user, status=Page.Status.PUBLISHED)
        collect(api_client, published, pageviews(10))
        collect(api_client, other, pageviews(3))
        assert AnalyticsEvent.objects.filter(page=other).count() == 3

    def test_sec_001_the_client_timestamp_is_ignored(self, api_client, published):
        collect(api_client, published, [{'event_type': 'pageview', 'timestamp': '9999-12-31T00:00:00Z'}])
        event = AnalyticsEvent.objects.get()
        assert abs(event.created_at - timezone.now()) < timedelta(minutes=1)

    def test_data_002_the_throttle_is_thirty_a_minute(self):
        assert AnalyticsCollectThrottle.rate == '30/min'


class TestRetention:
    def test_data_002_events_older_than_the_window_are_pruned(self, published, settings):
        settings.ANALYTICS_RETENTION_DAYS = 90
        old = AnalyticsEvent.objects.create(page=published, visitor_id='a', event_type='pageview')
        recent = AnalyticsEvent.objects.create(page=published, visitor_id='b', event_type='pageview')
        AnalyticsEvent.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=91))
        AnalyticsEvent.objects.filter(pk=recent.pk).update(created_at=timezone.now() - timedelta(days=89))

        assert prune_old_events(batch_size=1) == 1
        assert list(AnalyticsEvent.objects.values_list('visitor_id', flat=True)) == ['b']

    def test_nothing_to_prune(self):
        assert prune_old_events() == 0


class TestDashboardInSql:
    def add(self, page, visitor, event_type, event_data):
        AnalyticsEvent.objects.create(page=page, visitor_id=visitor, event_type=event_type, event_data=event_data)

    def test_perf_009_time_on_page_is_the_mean_of_each_visitors_longest(self, auth_client, published):
        for visitor, seconds in (('a', 10), ('a', 50), ('b', 20), ('c', -5)):
            self.add(published, visitor, 'time_on_page', {'seconds': seconds})
        self.add(published, 'd', 'time_on_page', {})
        assert dashboard(auth_client, published).data['avg_time_on_page'] == 35.0

    def test_perf_009_scroll_depth_counts_visitors_once_per_threshold(self, auth_client, published):
        for visitor, depth in (('a', 25), ('a', 25), ('b', 25), ('b', 50), ('c', 100), ('d', 33)):
            self.add(published, visitor, 'scroll_depth', {'depth': depth})
        assert dashboard(auth_client, published).data['scroll_depth_distribution'] == {25: 2, 50: 1, 75: 0, 100: 1}

    def test_perf_009_no_query_loads_the_raw_events(self, auth_client, published):
        """The old view read every time_on_page and scroll_depth row into Python."""
        self.add(published, 'a', 'time_on_page', {'seconds': 5})
        self.add(published, 'a', 'scroll_depth', {'depth': 50})
        with CaptureQueriesContext(connection) as captured:
            assert dashboard(auth_client, published).status_code == 200
        raw_reads = [
            q['sql'] for q in captured.captured_queries
            if '"analytics_analyticsevent"."event_data" FROM' in q['sql']
        ]
        assert raw_reads == []


class TestOddPeriods:
    @pytest.mark.parametrize('start, end', [
        ('2026-13-45T00:00:00Z', '2026-12-01T00:00:00Z'),  # ValueError
        ('0001-01-01T00:00:00Z', '0001-02-01T00:00:00Z'),  # OverflowError for the previous period
        ('2026-01-01T00:00:00', '2026-02-01T00:00:00Z'),   # naive and aware
        ('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z'),  # reversed
        ('2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),  # longer than a year
        ('nope', 'nope'),
    ])
    def test_sec_008_a_bad_custom_range_is_a_400_not_a_500(self, auth_client, published, start, end):
        response = dashboard(auth_client, published, period='custom', start=start, end=end)
        if start == '2026-01-01T00:00:00':
            # A naive moment is read as UTC: a valid range
            assert response.status_code == status.HTTP_200_OK
            return
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'INVALID_PERIOD'

    def test_a_good_custom_range(self, auth_client, published):
        response = dashboard(auth_client, published, period='custom', start='2026-01-01T00:00:00Z', end='2026-02-01T00:00:00Z')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['period']['start'].startswith('2026-01-01')

    def test_custom_without_dates_falls_back_to_thirty_days(self, auth_client, published):
        assert dashboard(auth_client, published, period='custom').status_code == status.HTTP_200_OK

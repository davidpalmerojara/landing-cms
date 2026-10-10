"""QA-028: a visitor cannot break a page's analytics. QA-006: the collect throttle has its own bucket."""
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

from analytics.models import AnalyticsEvent
from analytics.privacy import MAX_SECONDS_ON_PAGE, sanitize_event_data
from analytics.views import AnalyticsCollectThrottle
from pages.models import Page
from tests.factories import PageFactory

COLLECT = '/api/analytics/collect/'


class ProPlan:
    has_analytics = True


@pytest.fixture(autouse=True)
def production_anonymous_limit(monkeypatch):
    """conftest disables throttling; these tests are about the real 60/min anonymous limit."""
    monkeypatch.setattr(SimpleRateThrottle, 'THROTTLE_RATES', {'anon': '60/minute', 'user': '120/minute'})


@pytest.fixture
def published(user):
    return PageFactory(owner=user, status=Page.Status.PUBLISHED)


def collect(client, page, events):
    return client.post(COLLECT, {'page_id': str(page.pk), 'events': events}, format='json')


def time_event(seconds, kind='heartbeat'):
    return {'event_type': 'time_on_page', 'event_data': {'seconds': seconds, 'type': kind}}


class TestSecondsAreClampedOnWrite:
    @pytest.mark.parametrize(('sent', 'stored'), [
        (12, 12),
        (12.5, 12.5),
        (0, 0),
        (-5, 0),
        (1e308, MAX_SECONDS_ON_PAGE),
        (10**30, MAX_SECONDS_ON_PAGE),
        (MAX_SECONDS_ON_PAGE + 1, MAX_SECONDS_ON_PAGE),
    ])
    def test_values(self, sent, stored):
        assert sanitize_event_data('time_on_page', {'seconds': sent}) == {'seconds': stored}

    @pytest.mark.parametrize('bad', [float('inf'), float('-inf'), float('nan'), True, '5', None, [1]])
    def test_things_that_are_not_finite_numbers_are_dropped(self, bad):
        assert sanitize_event_data('time_on_page', {'seconds': bad}) == {}

    def test_the_type_is_still_kept(self):
        assert sanitize_event_data('time_on_page', {'seconds': float('inf'), 'type': 'exit'}) == {'type': 'exit'}


@pytest.mark.django_db
class TestTheDashboardSurvivesHugeValues:
    def test_collect_then_read(self, api_client, auth_client, published):
        for _ in range(2):
            assert collect(api_client, published, [time_event(1e308)]).status_code == 204
        assert {e.event_data['seconds'] for e in AnalyticsEvent.objects.all()} == {MAX_SECONDS_ON_PAGE}

        with patch('billing.permissions.get_user_plan', return_value=ProPlan()):
            response = auth_client.get(f'/api/pages/{published.id}/analytics/')
        assert response.status_code == 200
        assert response.data['avg_time_on_page'] == MAX_SECONDS_ON_PAGE

    def test_rows_stored_before_the_clamp_existed_do_not_break_the_read(self, auth_client, published):
        # Written straight into the table, like the rows a visitor could create before the fix
        now = timezone.now()
        for visitor, seconds in (('a', 1e308), ('b', 1e308), ('c', 30)):
            AnalyticsEvent.objects.create(
                page=published, visitor_id=visitor, event_type='time_on_page', event_data={'seconds': seconds},
                created_at=now,
            )
        AnalyticsEvent.objects.create(
            page=published, visitor_id='d', event_type='time_on_page', event_data={'seconds': 'oops'}, created_at=now,
        )

        with patch('billing.permissions.get_user_plan', return_value=ProPlan()):
            response = auth_client.get(f'/api/pages/{published.id}/analytics/')

        assert response.status_code == 200
        average = response.data['avg_time_on_page']
        assert 0 < average < float('inf')
        assert average == round((MAX_SECONDS_ON_PAGE * 2 + 30) / 3, 1)


@pytest.mark.django_db
class TestCollectThrottleBucket:
    def test_it_has_its_own_scope(self):
        assert AnalyticsCollectThrottle.scope == 'analytics'

    def test_collecting_does_not_use_up_the_anonymous_limit_of_other_endpoints(self, api_client, published):
        # 70 batches from one IP: more than the default anonymous limit (60/min) of everything else
        for _ in range(70):
            assert collect(api_client, published, [{'event_type': 'pageview'}]).status_code == 204
        assert api_client.get('/api/billing/plans/').status_code == 200

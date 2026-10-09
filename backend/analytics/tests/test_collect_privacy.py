from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch

import pytest
from django.utils import timezone

from analytics.models import AnalyticsEvent
from analytics.privacy import daily_visitor_hash, referrer_origin, sanitize_event_data
from pages.models import Page
from tests.factories import PageFactory

URL = '/api/analytics/collect/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0'
IP = '203.0.113.7'


@pytest.fixture
def published(user):
    return PageFactory(owner=user, status=Page.Status.PUBLISHED)


def _post(client, page, events, ip=IP, ua=UA, **extra):
    return client.post(
        URL,
        {'page_id': str(page.pk), 'events': events},
        format='json',
        REMOTE_ADDR=ip,
        HTTP_USER_AGENT=ua,
        **extra,
    )


def _at(day):
    """Pretend the server clock is at noon UTC on the given January 2026 day."""
    return patch(
        'analytics.privacy.timezone.now',
        return_value=datetime(2026, 1, day, 12, tzinfo=dt_timezone.utc),
    )


@pytest.mark.django_db
class TestVisitorHash:
    def test_same_visitor_same_day_same_hash(self, api_client, published):
        with _at(1):
            _post(api_client, published, [{'event_type': 'pageview'}])
            _post(api_client, published, [{'event_type': 'pageview'}])
        ids = set(AnalyticsEvent.objects.values_list('visitor_id', flat=True))
        assert len(ids) == 1
        assert len(ids.pop()) == 16

    def test_hash_rotates_by_day(self, api_client, published):
        with _at(1):
            _post(api_client, published, [{'event_type': 'pageview'}])
        with _at(2):
            _post(api_client, published, [{'event_type': 'pageview'}])
        assert AnalyticsEvent.objects.values('visitor_id').distinct().count() == 2

    def test_different_ip_agent_or_page_differs(self, api_client, published, user):
        other = PageFactory(owner=user, status=Page.Status.PUBLISHED)
        with _at(1):
            _post(api_client, published, [{'event_type': 'pageview'}])
            _post(api_client, published, [{'event_type': 'pageview'}], ip='198.51.100.9')
            _post(api_client, published, [{'event_type': 'pageview'}], ua='Other/1.0')
            _post(api_client, other, [{'event_type': 'pageview'}])
        assert AnalyticsEvent.objects.values('visitor_id').distinct().count() == 4

    def test_client_supplied_visitor_id_is_ignored(self, api_client, published):
        with _at(1):
            _post(api_client, published, [{'event_type': 'pageview', 'visitor_id': 'v_spoofed'}])
        assert AnalyticsEvent.objects.get().visitor_id != 'v_spoofed'

    def test_x_forwarded_for_ignored_without_proxies(self, api_client, published, settings):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, 'NUM_PROXIES': 0}
        with _at(1):
            for xff in ('1.1.1.1', '2.2.2.2'):
                _post(api_client, published, [{'event_type': 'pageview'}], HTTP_X_FORWARDED_FOR=xff)
        assert AnalyticsEvent.objects.values('visitor_id').distinct().count() == 1

    def test_hash_function_is_deterministic(self, rf):
        request = rf.post(URL, REMOTE_ADDR=IP, HTTP_USER_AGENT=UA)
        with _at(1):
            assert daily_visitor_hash(request, 'p') == daily_visitor_hash(request, 'p')


@pytest.mark.django_db
class TestNothingSensitiveStored:
    def test_no_ip_or_user_agent_stored(self, api_client, published):
        _post(api_client, published, [
            {'event_type': 'pageview', 'event_data': {'url': 'https://x.test/a'}, 'user_agent': UA},
        ])
        assert not hasattr(AnalyticsEvent, 'user_agent')
        for row in AnalyticsEvent.objects.values():
            blob = ' '.join(str(v) for v in row.values())
            assert IP not in blob
            assert 'Firefox' not in blob

    def test_query_string_and_fragment_not_stored(self, api_client, published):
        _post(api_client, published, [{
            'event_type': 'pageview',
            'event_data': {'url': 'https://x.test/promo?email=a@b.c&token=1#frag'},
        }])
        assert AnalyticsEvent.objects.get().event_data == {'path': '/promo'}

    def test_utm_still_stored_as_own_fields(self, api_client, published):
        _post(api_client, published, [
            {'event_type': 'pageview', 'utm_source': 'news', 'utm_medium': 'email'},
        ])
        evt = AnalyticsEvent.objects.get()
        assert (evt.utm_source, evt.utm_medium) == ('news', 'email')

    def test_click_text_not_stored_and_href_cleaned(self, api_client, published):
        _post(api_client, published, [{
            'event_type': 'click',
            'event_data': {'text': 'Jane Doe jane@x.com', 'href': '/pricing?ref=abc#top'},
        }])
        assert AnalyticsEvent.objects.get().event_data == {'href': '/pricing'}

    def test_non_http_href_dropped(self, api_client, published):
        _post(api_client, published, [
            {'event_type': 'click', 'event_data': {'href': 'mailto:a@b.c'}},
            {'event_type': 'click', 'event_data': {'href': 'javascript:alert(1)'}},
        ])
        assert all(e.event_data == {} for e in AnalyticsEvent.objects.all())

    def test_referrer_reduced_to_origin(self, api_client, published):
        _post(api_client, published, [
            {'event_type': 'pageview', 'referrer': 'https://search.test/results?q=private#x'},
        ])
        assert AnalyticsEvent.objects.get().referrer == 'https://search.test'


class TestHelpers:
    def test_referrer_origin(self):
        assert referrer_origin('https://a.test:8443/x?y=1') == 'https://a.test:8443'
        assert referrer_origin('ftp://a.test/x') is None
        assert referrer_origin('') is None

    def test_sanitize_drops_unknown_fields(self):
        assert sanitize_event_data('scroll_depth', {'depth': 50, 'x': 'y'}) == {'depth': 50}
        assert sanitize_event_data('time_on_page', {'seconds': 15, 'type': 'exit', 'q': 1}) == {
            'seconds': 15, 'type': 'exit',
        }


@pytest.mark.django_db
class TestOwnerAnalytics:
    def test_visitors_are_distinct_daily_hashes(self, auth_client, api_client, published):
        with _at(1):
            _post(api_client, published, [{'event_type': 'pageview'}])
            _post(api_client, published, [{'event_type': 'pageview'}])
        with _at(2):
            _post(api_client, published, [{'event_type': 'pageview'}])
        AnalyticsEvent.objects.update(created_at=timezone.now())
        with patch('billing.permissions.check_feature'):  # plan gate is not under test
            resp = auth_client.get(f'/api/pages/{published.pk}/analytics/')
        assert resp.status_code == 200, resp.data
        assert resp.data['total_views'] == 3
        # The same person on two different days counts twice, by design.
        assert resp.data['unique_visitors'] == 2

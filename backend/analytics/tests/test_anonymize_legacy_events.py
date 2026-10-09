"""Data migration 0003: events stored before cookieless analytics."""
import importlib
from datetime import datetime, timezone as dt_timezone

import pytest
from django.apps import apps

from analytics.models import AnalyticsEvent
from tests.factories import PageFactory

migration = importlib.import_module('analytics.migrations.0003_anonymize_legacy_events')


def legacy_event(page, visitor_id='v_1a2b3c_lq9x8y', day=1, **fields):
    event = AnalyticsEvent.objects.create(page=page, visitor_id=visitor_id, **fields)
    created = datetime(2026, 9, day, 12, 0, tzinfo=dt_timezone.utc)
    AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=created)
    return event


@pytest.mark.django_db
class TestAnonymizeLegacyEvents:
    def test_long_lived_visitor_id_becomes_a_daily_hash(self):
        page = PageFactory()
        monday = legacy_event(page, event_type='pageview', day=1)
        monday_again = legacy_event(page, event_type='click', day=1)
        tuesday = legacy_event(page, event_type='pageview', day=2)

        migration.anonymize(apps, None)

        ids = {e.pk: AnalyticsEvent.objects.get(pk=e.pk).visitor_id for e in (monday, monday_again, tuesday)}
        assert all(migration.CURRENT_ID.match(v) for v in ids.values())
        assert 'v_1a2b3c' not in ''.join(ids.values())
        # Same visitor, same day: still counted once
        assert ids[monday.pk] == ids[monday_again.pk]
        # Different day: no longer linkable
        assert ids[monday.pk] != ids[tuesday.pk]

    def test_referrer_keeps_only_the_origin(self):
        event = legacy_event(PageFactory(), event_type='pageview', referrer='https://www.google.com/search?q=private+words')

        migration.anonymize(apps, None)

        assert AnalyticsEvent.objects.get(pk=event.pk).referrer == 'https://www.google.com'

    def test_event_data_keeps_only_current_fields(self):
        page = PageFactory()
        click = legacy_event(page, event_type='click', event_data={
            'text': 'Escríbeme, Ana', 'href': 'https://example.com/a?token=secret', 'tag': 'A',
        })
        pageview = legacy_event(page, event_type='pageview', event_data={'url': 'https://paxl.app/p/x?email=a@b.c'})

        migration.anonymize(apps, None)

        assert AnalyticsEvent.objects.get(pk=click.pk).event_data == {'href': 'https://example.com/a'}
        assert AnalyticsEvent.objects.get(pk=pageview.pk).event_data == {'path': '/p/x'}

    def test_current_events_keep_their_visitor_id(self):
        event = legacy_event(PageFactory(), visitor_id='0123456789abcdef', event_type='pageview')

        migration.anonymize(apps, None)

        assert AnalyticsEvent.objects.get(pk=event.pk).visitor_id == '0123456789abcdef'

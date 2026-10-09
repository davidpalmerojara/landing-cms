"""Bring events stored before cookieless analytics in line with what is stored now.

Old events carried a visitor id kept in the visitor's browser (it recognised the
same person for months), the full referrer URL and click texts. Each old id is
replaced by a hash that changes every day, the referrer is cut to its origin and
event_data keeps only the fields collected today. Daily visitor counts stay the
same; nobody can be followed across days any more.
"""
import hashlib
import re

from django.db import migrations

from analytics.privacy import VISITOR_HASH_LENGTH, daily_salt, referrer_origin, sanitize_event_data

CURRENT_ID = re.compile(r'^[0-9a-f]{%d}$' % VISITOR_HASH_LENGTH)
BATCH = 500


def legacy_daily_hash(event):
    day = event.created_at.date()
    digest = hashlib.sha256(
        daily_salt(day) + b'|legacy|' + event.visitor_id.encode() + b'|' + str(event.page_id).encode()
    ).hexdigest()
    return digest[:VISITOR_HASH_LENGTH]


def anonymize(apps, schema_editor):
    AnalyticsEvent = apps.get_model('analytics', 'AnalyticsEvent')
    batch = []
    for event in AnalyticsEvent.objects.order_by('pk').iterator(chunk_size=BATCH):
        if not CURRENT_ID.match(event.visitor_id or ''):
            event.visitor_id = legacy_daily_hash(event)
        event.referrer = referrer_origin(event.referrer)
        event.event_data = sanitize_event_data(event.event_type, event.event_data)
        batch.append(event)
        if len(batch) >= BATCH:
            AnalyticsEvent.objects.bulk_update(batch, ['visitor_id', 'referrer', 'event_data'])
            batch = []
    if batch:
        AnalyticsEvent.objects.bulk_update(batch, ['visitor_id', 'referrer', 'event_data'])


class Migration(migrations.Migration):

    dependencies = [
        ('analytics', '0002_drop_user_agent'),
    ]

    operations = [
        migrations.RunPython(anonymize, migrations.RunPython.noop),
    ]

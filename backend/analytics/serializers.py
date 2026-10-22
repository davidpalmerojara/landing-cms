from rest_framework import serializers

# The tracker sends batches of 5; ten leaves room without letting one request write 50 rows (DATA-002)
MAX_EVENTS_PER_BATCH = 10

VALID_EVENT_TYPES = {'pageview', 'click', 'scroll_depth', 'time_on_page', 'cta_conversion'}


class SingleEventSerializer(serializers.Serializer):
    """Validates a single analytics event from the tracking pixel."""

    event_type = serializers.ChoiceField(choices=list(VALID_EVENT_TYPES))
    block_id = serializers.UUIDField(required=False, allow_null=True)
    block_type = serializers.CharField(max_length=50, required=False, allow_null=True, allow_blank=True)
    event_data = serializers.DictField(required=False, default=dict)
    referrer = serializers.CharField(max_length=2048, required=False, allow_null=True, allow_blank=True)
    screen_size = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)
    utm_source = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    utm_medium = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    utm_campaign = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    # A `timestamp` sent by the tracker is ignored: events are dated when they arrive (SEC-001)


class EventBatchSerializer(serializers.Serializer):
    """Validates a batch of analytics events for a specific page."""

    page_id = serializers.UUIDField()
    events = SingleEventSerializer(many=True, min_length=1, max_length=MAX_EVENTS_PER_BATCH)

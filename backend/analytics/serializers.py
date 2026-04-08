from rest_framework import serializers

VALID_EVENT_TYPES = {'pageview', 'click', 'scroll_depth', 'time_on_page', 'cta_conversion'}


class SingleEventSerializer(serializers.Serializer):
    """Validates a single analytics event from the tracking pixel."""

    event_type = serializers.ChoiceField(choices=list(VALID_EVENT_TYPES))
    visitor_id = serializers.CharField(max_length=64)
    block_id = serializers.UUIDField(required=False, allow_null=True)
    block_type = serializers.CharField(max_length=50, required=False, allow_null=True, allow_blank=True)
    event_data = serializers.DictField(required=False, default=dict)
    referrer = serializers.CharField(max_length=2048, required=False, allow_null=True, allow_blank=True)
    user_agent = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    screen_size = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)
    utm_source = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    utm_medium = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    utm_campaign = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    timestamp = serializers.DateTimeField(required=False, allow_null=True)


class EventBatchSerializer(serializers.Serializer):
    """Validates a batch of analytics events for a specific page."""

    page_id = serializers.UUIDField()
    events = SingleEventSerializer(many=True, min_length=1, max_length=50)

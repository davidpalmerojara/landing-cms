import uuid

from django.db import models


class AnalyticsEvent(models.Model):
    """
    Stores anonymous analytics events for published pages.

    Indices on (page, created_at, event_type) for efficient aggregation queries.
    For high-volume production, consider partitioning by date or migrating
    to a time-series DB like TimescaleDB.
    """

    class EventType(models.TextChoices):
        PAGEVIEW = 'pageview', 'Page View'
        CLICK = 'click', 'Click'
        SCROLL_DEPTH = 'scroll_depth', 'Scroll Depth'
        TIME_ON_PAGE = 'time_on_page', 'Time on Page'
        CTA_CONVERSION = 'cta_conversion', 'CTA Conversion'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        'pages.Page',
        on_delete=models.CASCADE,
        related_name='analytics_events',
    )
    visitor_id = models.CharField(max_length=64, db_index=True)
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    block_id = models.UUIDField(null=True, blank=True)
    block_type = models.CharField(max_length=50, null=True, blank=True)
    event_data = models.JSONField(default=dict, blank=True)
    referrer = models.URLField(max_length=2048, null=True, blank=True)
    user_agent = models.CharField(max_length=512, null=True, blank=True)
    screen_size = models.CharField(max_length=20, null=True, blank=True)
    utm_source = models.CharField(max_length=200, null=True, blank=True)
    utm_medium = models.CharField(max_length=200, null=True, blank=True)
    utm_campaign = models.CharField(max_length=200, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['page', 'created_at', 'event_type'],
                name='idx_analytics_page_date_type',
            ),
            models.Index(
                fields=['page', 'event_type'],
                name='idx_analytics_page_type',
            ),
            models.Index(
                fields=['page', 'block_id'],
                name='idx_analytics_page_block',
            ),
        ]

    def __str__(self):
        return f'{self.event_type} on {self.page_id} at {self.created_at}'

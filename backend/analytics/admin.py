from django.contrib import admin

from .models import AnalyticsEvent


@admin.register(AnalyticsEvent)
class AnalyticsEventAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'page', 'visitor_id', 'block_type', 'created_at')
    list_filter = ('event_type', 'created_at')
    search_fields = ('visitor_id', 'page__name')
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'

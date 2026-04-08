from django.urls import path

from .views import CollectView, PageAnalyticsView

urlpatterns = [
    path('analytics/collect/', CollectView.as_view(), name='analytics-collect'),
    path('pages/<uuid:page_id>/analytics/', PageAnalyticsView.as_view(), name='page-analytics'),
]

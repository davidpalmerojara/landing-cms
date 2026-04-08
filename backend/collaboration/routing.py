from django.urls import re_path

from .consumers import PageConsumer

websocket_urlpatterns = [
    re_path(r'ws/pages/(?P<page_id>[^/]+)/$', PageConsumer.as_asgi()),
]

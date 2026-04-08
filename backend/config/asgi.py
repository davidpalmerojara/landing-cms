"""
ASGI config for BuilderPro backend.
Routes HTTP to Django and WebSocket to Channels.
"""

import os

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

from collaboration.middleware import JWTAuthMiddleware  # noqa: E402
from collaboration.routing import websocket_urlpatterns  # noqa: E402

django_asgi = get_asgi_application()

application = ProtocolTypeRouter({
    'http': django_asgi,
    'websocket': JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})

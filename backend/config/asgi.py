"""
ASGI config for the Paxl backend.
Routes HTTP to Django and WebSocket to Channels.
"""

import os

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

from collaboration.middleware import JWTAuthMiddleware  # noqa: E402
from collaboration.routing import websocket_urlpatterns  # noqa: E402

if not settings.DEBUG:
    # Daphne does not run `manage.py check`: do it here so a production server with
    # an unsafe setting (NUM_PROXIES=0, a live Stripe key) refuses to start
    from django.core.management import call_command  # noqa: E402

    call_command('check')

django_asgi = get_asgi_application()

application = ProtocolTypeRouter({
    'http': django_asgi,
    # Cookies authenticate the socket, so the handshake Origin must be one of ours
    'websocket': OriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
        settings.CSRF_TRUSTED_ORIGINS,
    ),
})

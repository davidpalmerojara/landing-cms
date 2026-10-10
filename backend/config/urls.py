from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from config.features import features_view


def healthz(request):
    """Liveness check for the hosting platform. Must not touch the database,
    so frequent pings don't keep a serverless Postgres awake."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('healthz', healthz),
    path('api/features/', features_view),
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('pages.urls')),
    path('api/', include('ai_generation.urls')),
    path('api/', include('analytics.urls')),
    path('api/', include('billing.urls')),
    path('api/', include('submissions.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from config.admin_guard import limit_admin_login
from config.features import features_view


def healthz(request):
    """Liveness check for the hosting platform. Must not touch the database,
    so frequent pings don't keep a serverless Postgres awake."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('healthz', healthz),
    path('api/features/', features_view),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('pages.urls')),
    path('api/', include('ai_generation.urls')),
    path('api/', include('analytics.urls')),
    path('api/', include('billing.urls')),
    path('api/', include('submissions.urls')),
]

if settings.ADMIN_ENABLED:
    # Rate limit the sign-in before the site builds its URLs (it reads `login` then)
    admin.site.login = limit_admin_login(admin.site.login)
    urlpatterns.append(path(settings.ADMIN_URL_PATH, admin.site.urls))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

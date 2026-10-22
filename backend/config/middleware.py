"""Health checks answered before any host validation (DEPLOY-006)."""
from django.http import JsonResponse

# `/healthz` is what the hosting platform pings; `/api/healthz/` is the same answer
# through the frontend's /api rewrite, for the warm-up request of the landing page.
HEALTH_PATHS = frozenset({'/healthz', '/api/healthz', '/api/healthz/'})


class HealthzMiddleware:
    """Answers GET/HEAD on the health paths with 200 {"status": "ok"}.

    It sits first in MIDDLEWARE, so a Host the platform's port detector or health
    check uses (`localhost:10000`, an internal IP) never reaches `get_host()` and
    cannot raise DisallowedHost. No database access: frequent pings must not keep
    a serverless PostgreSQL awake.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in ('GET', 'HEAD') and request.path in HEALTH_PATHS:
            response = JsonResponse({'status': 'ok'})
            response['Cache-Control'] = 'no-store'
            return response
        return self.get_response(request)

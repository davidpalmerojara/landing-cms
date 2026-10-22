"""Serving uploaded images from the database at their /media/... URLs (ADR-049).

Pages store `/media/assets/<name>`; the frontend forwards /media to the
backend, so these URLs keep working wherever the API runs. A plain Django
view, not DRF: no throttle, no session, no authentication. Images in
published pages are public by nature and their names are random.

The response can be cached for a year by browsers (a new upload always gets
a new name) and for a day by the CDN in front, so a deleted image leaves the
edge soon. The type is the one the server detected; nosniff and a sandboxed
CSP make sure a browser never treats the bytes as anything but an image.
"""
from django.http import HttpResponse
from django.utils.http import parse_etags

from .models import Asset, AssetBlob, MEDIA_URL_PREFIX

SERVED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
BROWSER_CACHE = 'public, max-age=31536000, immutable'
CDN_CACHE = 'public, max-age=86400'
NOT_FOUND_CACHE = 'public, max-age=300'


def _with_common_headers(response: HttpResponse) -> HttpResponse:
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    return response


def _not_found() -> HttpResponse:
    response = HttpResponse(b'Not found', status=404, content_type='text/plain; charset=utf-8')
    response['Cache-Control'] = NOT_FOUND_CACHE
    return _with_common_headers(response)


def _matches(if_none_match: str, etag: str) -> bool:
    if not if_none_match:
        return False
    tags = parse_etags(if_none_match)
    # Weak comparison, as RFC 9110 asks for If-None-Match
    return '*' in tags or any(tag.removeprefix('W/') == etag for tag in tags)


def serve_asset(request, path: str) -> HttpResponse:
    if request.method not in ('GET', 'HEAD'):
        response = HttpResponse(status=405)
        response['Allow'] = 'GET, HEAD'
        return _with_common_headers(response)

    asset = Asset.objects.filter(path=path).values('pk', 'mime_type', 'sha256', 'size').first()
    if asset is None or asset['mime_type'] not in SERVED_TYPES:
        return _not_found()

    etag = f'"{asset["sha256"]}"' if asset['sha256'] else ''
    cache_headers = {'Cache-Control': BROWSER_CACHE, 'CDN-Cache-Control': CDN_CACHE}
    if etag:
        cache_headers['ETag'] = etag

    if etag and _matches(request.headers.get('If-None-Match', ''), etag):
        response = HttpResponse(status=304)
    elif request.method == 'HEAD':
        if not AssetBlob.objects.filter(asset_id=asset['pk']).exists():
            return _not_found()
        response = HttpResponse(content_type=asset['mime_type'])
        response['Content-Length'] = str(asset['size'])
    else:
        data = AssetBlob.objects.filter(asset_id=asset['pk']).values_list('data', flat=True).first()
        if data is None:
            return _not_found()
        response = HttpResponse(bytes(data), content_type=asset['mime_type'])
        response['Content-Disposition'] = 'inline'

    for name, value in cache_headers.items():
        response[name] = value
    return _with_common_headers(response)


class MediaMiddleware:
    """Answers /media/ before the rest of the middleware runs.

    Session, locale, CORS and authentication have nothing to do with a public
    image, and the locale middleware would add `Vary: Accept-Language`, which
    splits the CDN cache by the visitor's language. Placed right after
    SecurityMiddleware, which still adds its headers.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path_info.startswith(MEDIA_URL_PREFIX):
            return serve_asset(request, request.path_info[len(MEDIA_URL_PREFIX):])
        return self.get_response(request)

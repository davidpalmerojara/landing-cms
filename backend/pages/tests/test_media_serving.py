"""Serving uploaded images from the database at /media/... (ADR-049).

CODE-001 / DEPLOY-001: with DEBUG off, /media/ answered 404 and the files
lived on a disk the host wipes. The images are now rows, served by
pages.media with the stored type, long caching, an ETag and a sandbox.
"""
import pytest
from django.test import Client

from pages.models import Asset, AssetBlob

from .image_files import jpeg_bytes, upload

WEBP = b'RIFF\x1a\x00\x00\x00WEBPVP8 ' + b'\x00' * 16


def make_asset(path='assets/abc.webp', data=WEBP, mime_type='image/webp', sha256='f' * 64, owner=None):
    asset = Asset.objects.create(owner=owner, name='a', path=path, mime_type=mime_type, size=len(data), sha256=sha256)
    AssetBlob.objects.create(asset=asset, data=data)
    return asset


@pytest.fixture
def client():
    # Anonymous: images in published pages are seen by anyone
    return Client()


@pytest.mark.django_db
class TestServing:
    def test_serves_the_bytes_with_the_stored_type_and_safe_headers(self, client, settings):
        settings.DEBUG = False
        make_asset()
        resp = client.get('/media/assets/abc.webp')

        assert resp.status_code == 200
        assert resp.content == WEBP
        assert resp['Content-Type'] == 'image/webp'
        assert resp['Cache-Control'] == 'public, max-age=31536000, immutable'
        assert resp['CDN-Cache-Control'] == 'public, max-age=86400'
        assert resp['ETag'] == '"' + 'f' * 64 + '"'
        assert resp['X-Content-Type-Options'] == 'nosniff'
        assert resp['Content-Security-Policy'] == "default-src 'none'; sandbox"
        assert resp['Content-Disposition'] == 'inline'
        # The CDN must not split its cache by language or cookie
        assert 'Accept-Language' not in resp.get('Vary', '')
        assert 'Cookie' not in resp.get('Vary', '')
        assert 'Set-Cookie' not in resp

    def test_legacy_url_shape_keeps_working(self, client):
        """Pages saved before the move store /media/assets/<year>/<month>/<name>."""
        make_asset(path='assets/2026/10/7f3f.png', mime_type='image/png')
        assert client.get('/media/assets/2026/10/7f3f.png').status_code == 200

    def test_matching_etag_is_304_without_body(self, client):
        make_asset()
        resp = client.get('/media/assets/abc.webp', HTTP_IF_NONE_MATCH='"' + 'f' * 64 + '"')
        assert resp.status_code == 304
        assert resp.content == b''
        assert resp['ETag'] == '"' + 'f' * 64 + '"'
        assert resp['Cache-Control'] == 'public, max-age=31536000, immutable'

    def test_weak_and_listed_etags_match(self, client):
        make_asset()
        header = '"other", W/"' + 'f' * 64 + '"'
        assert client.get('/media/assets/abc.webp', HTTP_IF_NONE_MATCH=header).status_code == 304

    def test_other_etag_gets_the_image(self, client):
        make_asset()
        assert client.get('/media/assets/abc.webp', HTTP_IF_NONE_MATCH='"nope"').status_code == 200

    def test_head_has_the_length_and_no_body(self, client):
        make_asset()
        resp = client.head('/media/assets/abc.webp')
        assert resp.status_code == 200
        assert resp['Content-Length'] == str(len(WEBP))
        assert resp.content == b''

    def test_unknown_image_is_404(self, client):
        resp = client.get('/media/assets/missing.webp')
        assert resp.status_code == 404
        assert resp['X-Content-Type-Options'] == 'nosniff'

    def test_row_without_bytes_is_404(self, client):
        Asset.objects.create(name='a', path='assets/lost.png', mime_type='image/png', size=10)
        assert client.get('/media/assets/lost.png').status_code == 404
        assert client.head('/media/assets/lost.png').status_code == 404

    def test_only_image_types_are_served(self, client):
        make_asset(path='assets/x.html', mime_type='text/html')
        assert client.get('/media/assets/x.html').status_code == 404

    def test_writes_are_not_allowed(self, client):
        make_asset()
        resp = client.post('/media/assets/abc.webp')
        assert resp.status_code == 405
        assert resp['Allow'] == 'GET, HEAD'

    def test_deleted_image_stops_being_served(self, auth_client, client):
        created = auth_client.post('/api/assets/', {'file': upload(jpeg_bytes())}, format='multipart')
        url = created.data['url']
        assert client.get(url).status_code == 200

        auth_client.delete(f"/api/assets/{created.data['id']}/")
        assert client.get(url).status_code == 404

    def test_uploaded_image_round_trip(self, auth_client, client):
        created = auth_client.post('/api/assets/', {'file': upload(jpeg_bytes())}, format='multipart')
        resp = client.get(created.data['url'])
        assert resp.status_code == 200
        assert resp['Content-Type'] == 'image/webp'
        assert resp.content == bytes(AssetBlob.objects.get().data)

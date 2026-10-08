import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from pages.models import Asset

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64


@pytest.fixture(autouse=True)
def media_in_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.mark.django_db
class TestAssetUploads:
    def test_html_declared_as_png_is_rejected(self, auth_client):
        evil = SimpleUploadedFile('evil.html', b'<script>alert(document.cookie)</script>', content_type='image/png')
        resp = auth_client.post('/api/assets/', {'file': evil}, format='multipart')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert Asset.objects.count() == 0

    def test_real_image_is_stored_with_detected_type_and_safe_name(self, auth_client):
        upload = SimpleUploadedFile('evil.html', PNG, content_type='text/html')
        resp = auth_client.post('/api/assets/', {'file': upload}, format='multipart')

        assert resp.status_code == status.HTTP_201_CREATED
        asset = Asset.objects.get()
        assert asset.mime_type == 'image/png'
        assert asset.file.name.endswith('.png')
        assert 'evil' not in asset.file.name
        assert asset.name == 'evil.html'  # original name kept only as a label

    def test_svg_is_rejected(self, auth_client):
        svg = SimpleUploadedFile('logo.svg', b'<svg onload="alert(1)"/>', content_type='image/svg+xml')
        resp = auth_client.post('/api/assets/', {'file': svg}, format='multipart')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

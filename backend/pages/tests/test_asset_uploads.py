"""Uploading images: what is stored, the limits and the quotas (ADR-049).

CODE-001 / DEPLOY-001 / PERF-005 / SEC image requirements: images are decoded
and re-encoded with Pillow, stored in the database within quotas, and never
read when the library is listed or an image is deleted. CODE-009: long names.
"""
import io

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from PIL import Image
from rest_framework import status

from pages.models import Asset, AssetBlob
from tests.factories import UserFactory

from .image_files import (
    GPS_IFD, animated_gif_bytes, jpeg_bytes, jpeg_with_gps_and_orientation, png_bytes,
    png_header_claiming, upload,
)

URL = '/api/assets/'


def post(client, data, name='photo.jpg', content_type='image/jpeg'):
    return client.post(URL, {'file': upload(data, name, content_type)}, format='multipart')


def stored_image(asset: Asset) -> Image.Image:
    return Image.open(io.BytesIO(bytes(AssetBlob.objects.get(asset=asset).data)))


@pytest.mark.django_db
class TestOnlyImagesAreStored:
    def test_html_declared_as_png_is_rejected(self, auth_client):
        resp = post(auth_client, b'<script>alert(document.cookie)</script>', 'evil.html', 'image/png')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'INVALID_IMAGE'
        assert Asset.objects.count() == 0

    def test_svg_is_rejected(self, auth_client):
        resp = post(auth_client, b'<svg onload="alert(1)"/>', 'logo.svg', 'image/svg+xml')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_polyglot_with_a_jpeg_signature_and_html_is_rejected(self, auth_client):
        """SEC: `FF D8 FF` followed by HTML passed the signature check and was stored as image/jpeg."""
        polyglot = b'\xff\xd8\xff\xe0<html><script>alert(document.domain)</script></html>' + b' ' * 64
        resp = post(auth_client, polyglot, 'cat.jpg')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'INVALID_IMAGE'
        assert Asset.objects.count() == 0

    def test_truncated_image_is_rejected(self, auth_client):
        resp = post(auth_client, jpeg_bytes(400, 300)[:300], 'cut.jpg')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert AssetBlob.objects.count() == 0

    def test_anything_after_a_real_image_is_not_stored(self, auth_client):
        """A valid JPEG with HTML appended: the stored file is a new encoding of the pixels only."""
        payload = b'<html><script>alert(1)</script></html>'
        resp = post(auth_client, jpeg_bytes() + payload, 'photo.jpg')
        assert resp.status_code == status.HTTP_201_CREATED
        stored = bytes(AssetBlob.objects.get().data)
        assert payload not in stored
        assert stored[:4] == b'RIFF' and stored[8:12] == b'WEBP'

    def test_signature_and_decoder_must_agree(self, auth_client):
        # A PNG signature on a file Pillow reads as something else is refused
        resp = post(auth_client, b'\x89PNG\r\n\x1a\n' + jpeg_bytes(), 'x.png', 'image/png')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_decompression_bomb_is_refused_without_decoding(self, auth_client):
        resp = post(auth_client, png_header_claiming(10_000, 10_000), 'bomb.png', 'image/png')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'IMAGE_TOO_LARGE'


@pytest.mark.django_db
class TestWhatIsStored:
    def test_photo_is_stored_as_webp_under_a_random_name(self, auth_client):
        resp = post(auth_client, jpeg_bytes(), 'evil.html', 'text/html')

        assert resp.status_code == status.HTTP_201_CREATED
        asset = Asset.objects.get()
        assert asset.mime_type == 'image/webp'
        assert asset.path.startswith('assets/') and asset.path.endswith('.webp')
        assert 'evil' not in asset.path
        assert asset.name == 'evil.html'  # original name kept only as a label
        assert resp.data['url'] == f'/media/{asset.path}'
        assert (resp.data['width'], resp.data['height']) == (64, 48)
        blob = bytes(AssetBlob.objects.get(asset=asset).data)
        assert asset.size == len(blob)
        import hashlib
        assert asset.sha256 == hashlib.sha256(blob).hexdigest()

    def test_exif_and_gps_are_removed_and_orientation_applied(self, auth_client):
        """A phone photo published on a page must not carry where it was taken."""
        resp = post(auth_client, jpeg_with_gps_and_orientation(200, 100, orientation=6))

        assert resp.status_code == status.HTTP_201_CREATED
        image = stored_image(Asset.objects.get())
        exif = image.getexif()
        assert len(exif) == 0
        assert not exif.get_ifd(GPS_IFD)
        assert 'exif' not in image.info and 'icc_profile' not in image.info
        # Orientation 6 means "rotate to display": the stored pixels are already upright
        assert image.size == (100, 200)

    def test_colour_profile_is_applied_and_not_kept(self, auth_client):
        from PIL import ImageCms
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        output = io.BytesIO()
        Image.new('RGB', (40, 30), (10, 120, 200)).save(output, 'JPEG', icc_profile=profile)

        resp = post(auth_client, output.getvalue())
        assert resp.status_code == status.HTTP_201_CREATED
        assert 'icc_profile' not in stored_image(Asset.objects.get()).info

    def test_multi_picture_jpeg_from_a_camera_is_accepted(self, auth_client):
        # Some phone cameras write MPO: a JPEG with more pictures after it
        output = io.BytesIO()
        first, second = Image.new('RGB', (60, 40), (200, 0, 0)), Image.new('RGB', (60, 40), (0, 200, 0))
        first.save(output, 'MPO', save_all=True, append_images=[second])

        resp = post(auth_client, output.getvalue())
        assert resp.status_code == status.HTTP_201_CREATED
        assert stored_image(Asset.objects.get()).size == (60, 40)

    def test_large_photo_is_scaled_down(self, auth_client):
        """MOBILE-001 / PERF-005: the longest side is at most 1600 px."""
        resp = post(auth_client, jpeg_bytes(3200, 2400))
        assert resp.status_code == status.HTTP_201_CREATED
        assert (resp.data['width'], resp.data['height']) == (1600, 1200)
        assert stored_image(Asset.objects.get()).size == (1600, 1200)

    def test_transparent_png_keeps_its_transparency(self, auth_client):
        resp = post(auth_client, png_bytes(), 'logo.png', 'image/png')
        assert resp.status_code == status.HTTP_201_CREATED
        image = stored_image(Asset.objects.get())
        assert image.format == 'WEBP'
        assert image.mode == 'RGBA'

    def test_animated_gif_keeps_its_frames(self, auth_client):
        resp = post(auth_client, animated_gif_bytes(frames=3), 'anim.gif', 'image/gif')
        assert resp.status_code == status.HTTP_201_CREATED
        asset = Asset.objects.get()
        assert asset.mime_type == 'image/gif' and asset.path.endswith('.gif')
        assert stored_image(asset).n_frames == 3

    def test_long_file_name_is_cut_to_the_column(self, auth_client):
        """CODE-009: a name over 200 characters was a 500 on PostgreSQL."""
        resp = post(auth_client, jpeg_bytes(), 'a' * 230 + '.jpg')
        assert resp.status_code == status.HTTP_201_CREATED
        assert len(Asset.objects.get().name) == 200

    def test_control_characters_are_removed_from_the_name(self, auth_client):
        # PostgreSQL refuses NUL in text
        resp = post(auth_client, jpeg_bytes(), 'fo\x00to\x1b.jpg')
        assert resp.status_code == status.HTTP_201_CREATED
        assert Asset.objects.get().name == 'foto.jpg'

    def test_missing_file_is_a_clear_400(self, auth_client):
        resp = auth_client.post(URL, {}, format='multipart')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'NO_FILE'


@pytest.mark.django_db
class TestLimitsAndQuotas:
    def test_file_over_the_upload_limit_is_413(self, auth_client, settings):
        settings.ASSET_MAX_UPLOAD_BYTES = 1000
        resp = post(auth_client, jpeg_bytes(400, 400, quality=100))
        assert resp.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        assert resp.data['code'] == 'FILE_TOO_LARGE'
        assert resp.data['max_bytes'] == 1000

    def test_the_default_limits(self, settings):
        from pages.assets import max_upload_bytes, storage_max_bytes, user_max_bytes, user_max_files
        assert max_upload_bytes() == 5 * 1024 * 1024
        assert user_max_files() == 30
        assert user_max_bytes() == 15 * 1024 * 1024
        assert storage_max_bytes() == 300 * 1024 * 1024

    def test_per_account_file_quota(self, auth_client, settings):
        settings.ASSET_USER_MAX_FILES = 2
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_201_CREATED
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_201_CREATED

        resp = post(auth_client, jpeg_bytes())
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'ASSET_QUOTA'
        assert resp.data['max_files'] == 2
        assert Asset.objects.count() == 2

    def test_per_account_byte_quota(self, auth_client, settings):
        post(auth_client, jpeg_bytes())
        settings.ASSET_USER_MAX_BYTES = Asset.objects.get().size + 10

        resp = post(auth_client, jpeg_bytes(color=(10, 200, 10)))
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert resp.data['code'] == 'ASSET_QUOTA'
        assert AssetBlob.objects.count() == 1

    def test_quota_is_per_account(self, auth_client, settings):
        settings.ASSET_USER_MAX_FILES = 1
        other = UserFactory()
        Asset.objects.create(owner=other, name='x', path='assets/other.webp', size=10)
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_201_CREATED

    def test_global_storage_cap(self, auth_client, settings):
        other = UserFactory()
        Asset.objects.create(owner=other, name='big', path='assets/big.webp', size=10_000)
        settings.ASSET_STORAGE_MAX_BYTES = 10_100

        resp = post(auth_client, jpeg_bytes(300, 300))
        assert resp.status_code == 507
        assert resp.data['code'] == 'STORAGE_FULL'
        assert Asset.objects.filter(owner__isnull=False).count() == 1

    def test_uploads_are_throttled_per_account(self, auth_client, settings):
        settings.ASSET_UPLOAD_RATE = '2/hour'
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_201_CREATED
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_201_CREATED
        assert post(auth_client, jpeg_bytes()).status_code == status.HTTP_429_TOO_MANY_REQUESTS
        # Listing is not an upload
        assert auth_client.get(URL).status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestTheBytesAreNeverReadByAccident:
    def test_listing_never_reads_the_blob_table(self, auth_client):
        post(auth_client, jpeg_bytes())
        with CaptureQueriesContext(connection) as queries:
            resp = auth_client.get(URL)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['count'] == 1
        assert not any('assetblob' in query['sql'].lower() for query in queries)

    def test_deleting_removes_the_bytes_without_reading_them(self, auth_client):
        post(auth_client, jpeg_bytes())
        asset = Asset.objects.get()
        with CaptureQueriesContext(connection) as queries:
            resp = auth_client.delete(f'{URL}{asset.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert AssetBlob.objects.count() == 0
        blob_queries = [query['sql'].lower() for query in queries if 'assetblob' in query['sql'].lower()]
        assert blob_queries and all(sql.startswith('delete') for sql in blob_queries)

    def test_whole_library_fits_on_one_page(self, auth_client, user):
        for index in range(25):
            Asset.objects.create(owner=user, name=f'{index}', path=f'assets/{index}.webp', size=1)
        resp = auth_client.get(URL)
        assert len(resp.data['results']) == 25


@pytest.mark.django_db
class TestAssetUrlIsRelativeToTheSite:
    """QA-079: pages store the URL; it must not tie them to the host the API runs on."""

    def test_the_url_starts_with_media(self, auth_client):
        created = post(auth_client, png_bytes(), 'a.png', 'image/png')
        assert created.status_code == status.HTTP_201_CREATED
        assert created.data['url'].startswith('/media/assets/')
        assert '://' not in created.data['url']

        listed = auth_client.get(URL)
        assert [item['url'] for item in listed.data['results']] == [created.data['url']]

    def test_a_block_accepts_that_url_as_an_image(self, auth_client, page):
        from pages.block_validators import clean_block_data

        url = post(auth_client, png_bytes(), 'a.png', 'image/png').data['url']
        assert clean_block_data('hero', {'backgroundImage': url})['backgroundImage'] == url

"""Storing uploaded images in the database, within the quotas (ADR-049).

The free PostgreSQL refuses every write once its storage is full, and then the
whole editor stops saving. So images have a budget: per account (files and
bytes) and for all accounts together, checked before anything is written.
"""
import hashlib
import logging
import unicodedata
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce

from .images import ImageRejected, process_image
from .models import Asset, AssetBlob

logger = logging.getLogger(__name__)

MB = 1024 * 1024


def max_upload_bytes() -> int:
    """Largest original file accepted. The editor makes phone photos smaller before sending them."""
    return getattr(settings, 'ASSET_MAX_UPLOAD_BYTES', 5 * MB)


def user_max_files() -> int:
    return getattr(settings, 'ASSET_USER_MAX_FILES', 30)


def user_max_bytes() -> int:
    return getattr(settings, 'ASSET_USER_MAX_BYTES', 15 * MB)


def storage_max_bytes() -> int:
    """All stored images together (about 300 MB of a 0.5 GB database)."""
    return getattr(settings, 'ASSET_STORAGE_MAX_BYTES', 300 * MB)


class UploadRefused(Exception):
    """An upload the server does not store: HTTP status, API code and the envelope's extra fields."""

    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def body(self) -> dict:
        return {'error': self.message, 'code': self.code, **(self.extra or {})}


def quota_details() -> dict:
    return {'max_files': user_max_files(), 'max_bytes': user_max_bytes()}


def usage_of(user) -> tuple[int, int]:
    usage = Asset.objects.filter(owner=user).aggregate(files=Count('id'), bytes=Coalesce(Sum('size'), 0))
    return usage['files'], usage['bytes']


def check_file_quota(user) -> None:
    """Before decoding anything: a full library is refused at once."""
    files, _ = usage_of(user)
    if files >= user_max_files():
        raise UploadRefused(
            403, 'ASSET_QUOTA',
            f'Has llegado al máximo de {user_max_files()} imágenes. Borra alguna para subir otra.',
            quota_details(),
        )


def clean_asset_name(original: str | None) -> str:
    """The original file name, kept only as a label: no control characters
    (PostgreSQL refuses NUL), cut to the column's length (CODE-009)."""
    name = ''.join(char for char in (original or '') if unicodedata.category(char)[0] != 'C').strip()
    max_length = Asset._meta.get_field('name').max_length
    return name[:max_length] or 'imagen'


def store_upload(user, uploaded_file) -> Asset:
    """Validate, re-encode and store one uploaded image for `user`. Raises UploadRefused."""
    if uploaded_file.size > max_upload_bytes():
        size_mb = uploaded_file.size / MB
        raise UploadRefused(
            413, 'FILE_TOO_LARGE',
            f'El archivo es demasiado grande ({size_mb:.1f} MB). El máximo es {max_upload_bytes() // MB} MB.',
            {'max_bytes': max_upload_bytes()},
        )
    check_file_quota(user)

    try:
        image = process_image(uploaded_file)
    except ImageRejected as rejected:
        raise UploadRefused(400, rejected.code, rejected.message) from None

    with transaction.atomic():
        # One upload at a time per account, so two in parallel cannot both pass the quota
        get_user_model().objects.select_for_update().filter(pk=user.pk).first()
        files, used_bytes = usage_of(user)
        if files >= user_max_files() or used_bytes + len(image.data) > user_max_bytes():
            raise UploadRefused(
                403, 'ASSET_QUOTA',
                f'No queda espacio para más imágenes ({user_max_files()} imágenes o '
                f'{user_max_bytes() // MB} MB como máximo). Borra alguna para subir otra.',
                quota_details(),
            )
        stored_total = Asset.objects.aggregate(total=Coalesce(Sum('size'), 0))['total']
        if stored_total + len(image.data) > storage_max_bytes():
            logger.error('Image storage is full (%s bytes stored); uploads are refused', stored_total)
            raise UploadRefused(
                507, 'STORAGE_FULL',
                'El almacenamiento de imágenes de esta demo está lleno. Prueba más tarde.',
            )
        asset = Asset.objects.create(
            owner=user,
            name=clean_asset_name(uploaded_file.name),
            path=f'assets/{uuid.uuid4().hex}.{image.extension}',
            mime_type=image.mime_type,
            size=len(image.data),
            width=image.width,
            height=image.height,
            sha256=hashlib.sha256(image.data).hexdigest(),
        )
        AssetBlob.objects.create(asset=asset, data=image.data)
    return asset

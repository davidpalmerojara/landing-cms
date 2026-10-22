"""Storage limits of pages and versions (SEC-001, ADR-052).

The demo runs on a 0.5 GB database, and one guest could fill half of it in a
minute with pages of Custom HTML and saved versions. Two limits:
- one page's blocks (data + styles, as JSON) up to MAX_PAGE_BYTES:
  `413 PAGE_TOO_LARGE`;
- everything an account stores (its pages' blocks plus its saved versions)
  up to ACCOUNT_STORAGE_LIMIT_BYTES (GUEST_STORAGE_LIMIT_BYTES for guests):
  `403 STORAGE_LIMIT` on whatever would add to it (a bigger save, a new page,
  a duplicate, "Save version", publishing).

The budget belongs to the page owner: a collaborator's save counts for the
owner. A save that does not grow the page is always accepted, so an account
over its budget can still edit and delete. Sizes are the length of the JSON
text, an approximation of what the database stores.
"""
import json

from django.conf import settings
from django.db.models import Sum, TextField
from django.db.models.functions import Cast, Length
from rest_framework import status
from rest_framework.exceptions import APIException


class PageTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_code = 'PAGE_TOO_LARGE'

    def __init__(self, limit_bytes: int):
        super().__init__(detail={
            'error': f'La página ocupa demasiado: el máximo es {limit_bytes // 1000} KB de contenido.',
            'code': 'PAGE_TOO_LARGE',
            'limit_bytes': limit_bytes,
        })


class StorageLimitReached(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'STORAGE_LIMIT'

    def __init__(self, limit_bytes: int):
        super().__init__(detail={
            'error': (
                'Tu cuenta ha llegado al espacio máximo de esta demo. '
                'Elimina versiones guardadas o páginas que no uses.'
            ),
            'code': 'STORAGE_LIMIT',
            'limit_bytes': limit_bytes,
        })


def _json_bytes(value) -> int:
    # Measured like the stored text (Django writes JSON with json.dumps defaults)
    return len(json.dumps(value))


def blocks_bytes(blocks) -> int:
    """Size of a list of blocks (dicts with `data` and `styles`), as stored."""
    return sum(_json_bytes(block.get('data') or {}) + _json_bytes(block.get('styles') or {}) for block in blocks)


def check_page_size(blocks) -> int:
    """Raise PageTooLarge past MAX_PAGE_BYTES; return the size."""
    size = blocks_bytes(blocks)
    if size > settings.MAX_PAGE_BYTES:
        raise PageTooLarge(settings.MAX_PAGE_BYTES)
    return size


def stored_page_bytes(page_ids) -> int:
    """What the blocks of these pages take in the database (JSON text length)."""
    from .models import Block

    total = Block.objects.filter(page_id__in=page_ids).aggregate(
        size=Sum(Length(Cast('data', TextField())) + Length(Cast('styles', TextField()))),
    )['size']
    return total or 0


def account_storage_bytes(owner, exclude_page_id=None) -> int:
    """Blocks of every page the account owns plus its saved versions."""
    from .models import Page, PageVersion

    pages = Page.objects.filter(owner=owner)
    if exclude_page_id is not None:
        pages = pages.exclude(pk=exclude_page_id)
    block_bytes = stored_page_bytes(pages.values('pk'))
    version_bytes = PageVersion.objects.filter(page__owner=owner).aggregate(size=Sum('size_bytes'))['size'] or 0
    return block_bytes + version_bytes


def storage_limit_for(owner) -> int:
    return settings.GUEST_STORAGE_LIMIT_BYTES if getattr(owner, 'is_guest', False) else settings.ACCOUNT_STORAGE_LIMIT_BYTES


def check_page_write(owner, page_id, new_bytes: int) -> None:
    """A save, a new page or a duplicate: refused only if it grows the page past the account's budget."""
    if owner is None:
        return
    current = stored_page_bytes([page_id]) if page_id is not None else 0
    if new_bytes <= current:
        return
    limit = storage_limit_for(owner)
    if account_storage_bytes(owner, exclude_page_id=page_id) + new_bytes > limit:
        raise StorageLimitReached(limit)


def check_snapshot(page) -> None:
    """A new saved version of the page (manual save, publish) must fit in the owner's budget."""
    owner = page.owner
    if owner is None:
        return
    limit = storage_limit_for(owner)
    if account_storage_bytes(owner) + stored_page_bytes([page.pk]) > limit:
        raise StorageLimitReached(limit)

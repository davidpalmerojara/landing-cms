"""Page versioning and change notifications for collaboration (ADR-024).

Every write that changes a page bumps `Page.version`. A save based on an older
version is refused (`VersionConflict`), and every other open editor is told
through the WebSocket group that the page changed (`page_updated`) so it can
fetch and merge. The server is the source of truth; the socket is only a hint.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import F

from .models import Page

logger = logging.getLogger(__name__)

CONNECTION_ID_HEADER = 'X-Connection-Id'
MAX_CONNECTION_ID_LENGTH = 100

REASON_SAVE = 'save'
REASON_RESTORE = 'restore'
REASON_PUBLISH = 'publish'
REASON_AI = 'ai'


class VersionConflict(Exception):
    """The page changed since the version the client based its edit on."""


def page_group_name(page_id) -> str:
    return f'page_{page_id}'


def claim_version(page: Page, expected: int) -> None:
    """Bump the version only if it is still `expected`, in one statement.

    The conditional UPDATE is the lock: of two simultaneous saves with the same
    version exactly one matches. Call it first inside a transaction so the row
    stays locked until the page and its blocks are written.
    """
    updated = Page.objects.filter(pk=page.pk, version=expected).update(version=F('version') + 1)
    if updated == 0:
        raise VersionConflict()
    page.version = expected + 1


def bump_version(page: Page) -> int:
    """Increment the version unconditionally (restore, publish, AI) and return the new one."""
    Page.objects.filter(pk=page.pk).update(version=F('version') + 1)
    page.version = Page.objects.values_list('version', flat=True).get(pk=page.pk)
    return page.version


def connection_id_from(request) -> str | None:
    """The WebSocket connection that made this request, if the client said so."""
    value = request.headers.get(CONNECTION_ID_HEADER, '').strip()
    return value[:MAX_CONNECTION_ID_LENGTH] or None


def _send_to_page_group(page_id, message: dict) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(page_group_name(page_id), message)


def notify_page_updated(page: Page, reason: str, user, connection_id: str | None = None) -> None:
    """Tell everyone editing the page that it changed. Never raises: the write
    has already happened, and a missed hint only delays other editors until
    their next save (which gets a 409 and merges)."""
    try:
        _send_to_page_group(page.pk, {
            'type': 'page.updated',
            'version': page.version,
            'reason': reason,
            'by': {'user_id': str(user.pk), 'username': user.username},
            'connection_id': connection_id,
        })
    except Exception:
        logger.warning('Failed to broadcast page_updated for page %s', page.pk, exc_info=True)


def notify_access_revoked(page_id, user_id) -> None:
    """Close the open sockets of a user who is no longer a collaborator."""
    try:
        _send_to_page_group(page_id, {'type': 'access.revoked', 'user_id': str(user_id)})
    except Exception:
        logger.warning('Failed to broadcast access_revoked for page %s', page_id, exc_info=True)

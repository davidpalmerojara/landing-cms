"""
WebSocket consumer for real-time page collaboration.

Handles: authentication, room join/leave, block locks, presence, live relay of
typing inside a locked block, change notifications and keepalive ping/pong.

Presence and locks belong to a CONNECTION, not to a user: two tabs of the same
user are two participants, and closing one never releases the other's locks.
The server is the source of truth for the page itself; the socket only tells
editors that it changed (`page_updated`) so they fetch and merge (ADR-024).
"""

import json
import logging
import math
import uuid

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import ValidationError

from pages.block_validators import clean_block_data

from .locks import InMemoryLockManager, LockManager, get_lock_manager

logger = logging.getLogger(__name__)

# Close codes
CLOSE_UNAUTHENTICATED = 4001
CLOSE_FORBIDDEN = 4003
CLOSE_SERVER_ERROR = 4500

# `reason` of an access.revoked group message sent when the page is deleted
REVOKED_PAGE_DELETED = 'page_deleted'

MAX_STYLES_BYTES = 8_000
MAX_BLOCK_ID_LENGTH = 64
# Cursor positions are canvas coordinates (they can be negative once the canvas
# is panned); anything beyond this is a broken or hostile client
CURSOR_LIMIT = 100_000


@database_sync_to_async
def get_accessible_page(user, page_id: str):
    """The page if the user owns it or collaborates on it, else None."""
    from django.core.exceptions import ValidationError as DjangoValidationError
    from django.db.models import Q
    from pages.models import Page
    try:
        return (
            Page.objects.select_related('owner')
            .filter(Q(owner=user) | Q(collaborators=user), pk=page_id)
            .distinct()
            .first()
        )
    except (DjangoValidationError, ValueError):  # malformed UUID
        return None


@database_sync_to_async
def owner_has_collaboration(owner) -> bool:
    """Collaboration is a feature of the PAGE OWNER's plan: a Pro owner can
    invite a Free user, who then edits with them."""
    from billing.permissions import get_user_plan
    return bool(getattr(get_user_plan(owner), 'has_collaboration', False))


@database_sync_to_async
def get_block_type(page_id: str, block_id: str) -> str | None:
    """Type of the block if it exists and belongs to this page, else None."""
    from django.core.exceptions import ValidationError as DjangoValidationError
    from pages.models import Block
    try:
        return Block.objects.filter(page_id=page_id, id=block_id).values_list('type', flat=True).first()
    except (DjangoValidationError, ValueError):  # malformed UUID
        return None


def clean_styles(styles):
    """Styles are inline CSS values: a small object of primitives (plus the
    nested per-device 'responsive' object). Anything else is dropped."""
    if not isinstance(styles, dict) or len(json.dumps(styles)) > MAX_STYLES_BYTES:
        return None

    def primitives(obj, depth=0):
        cleaned = {}
        for key, value in obj.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                cleaned[str(key)] = value
            elif isinstance(value, dict) and depth < 2:
                cleaned[str(key)] = primitives(value, depth + 1)
        return cleaned

    return primitives(styles)


def clean_cursor_coordinate(value) -> float | None:
    """A finite number clamped to the canvas range, or None if it is not a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return float(max(-CURSOR_LIMIT, min(CURSOR_LIMIT, value)))


def is_valid_block_id(block_id) -> bool:
    return isinstance(block_id, str) and 0 < len(block_id) <= MAX_BLOCK_ID_LENGTH


class PageConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for a single page editing session.

    URL: ws://.../ws/pages/{page_id}/?ticket=<single-use ticket>  (or the bp_access cookie)

    Message protocol (client → server):
        { "type": "ping" }
        { "type": "lock_acquire", "block_id": "..." }
        { "type": "lock_release", "block_id": "..." }
        { "type": "lock_renew",   "block_id": "..." }
        { "type": "block_updated", "block_id": "...", "data": {...}, "styles": {...} }
        { "type": "cursor_move",  "x": 120, "y": 340 }

    Message protocol (server → client). An "entry" is
    { "connection_id", "user_id", "username" }:
        { "type": "pong" }
        { "type": "connected", "connection_id": "...", "users": [entry], "locks": {block_id: entry}, "version": 3 }
        { "type": "user_joined" | "user_left", ...entry }
        { "type": "lock_acquired" | "lock_released", "block_id": "...", ...entry }
        { "type": "lock_rejected", "block_id": "...", "holder": entry }
        { "type": "block_updated", "block_id": "...", "data": {...}, "styles": {...}, "connection_id", "user_id" }
        { "type": "cursor_moved", "connection_id", "user_id", "username", "x": 120, "y": 340 }
        { "type": "page_updated", "version": 4, "reason": "save|restore|publish|ai", "by": {...}, "connection_id": "..."|null }
        { "type": "error", "code": "...", "message": "..." }   (access_revoked, page_deleted, plan_limit, ...)
    """

    # Who is connected, per page group: {group_name: {connection_id: entry}}.
    # Process-local like the in-memory channel layer and locks (ADR-015): with
    # several processes (REDIS_URL) presence needs to move to a shared store.
    _page_connections: dict[str, dict[str, dict]] = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.page_id: str = ''
        self.group_name: str = ''
        self.user = None
        self.connection_id: str = ''
        self.entry: dict = {}
        # True from the moment this connection is in the group and the presence
        # list until disconnect cleans up; a refused connection never gets there,
        # so it never broadcasts anything.
        self._joined = False
        self._lock_manager: LockManager | InMemoryLockManager | None = None

    @property
    def lock_manager(self) -> LockManager | InMemoryLockManager:
        if self._lock_manager is None:
            self._lock_manager = get_lock_manager()
        return self._lock_manager

    async def _lock_call(self, method: str, *args):
        """Call the lock manager without blocking the event loop. The in-memory
        manager is a dict behind a mutex; Redis does network I/O, so it goes to a thread."""
        call = getattr(self.lock_manager, method)
        if isinstance(self.lock_manager, InMemoryLockManager):
            return call(*args)
        return await sync_to_async(call, thread_sensitive=False)(*args)

    async def _safe_group_send(self, message: dict) -> None:
        """Broadcasts are best effort: a failing channel layer must not break
        the handler that triggered them (least of all disconnect)."""
        try:
            await self.channel_layer.group_send(self.group_name, message)
        except Exception:
            logger.warning('Failed to broadcast %s to %s', message.get('type'), self.group_name, exc_info=True)

    def _presence(self) -> dict[str, dict]:
        return self._page_connections.setdefault(self.group_name, {})

    def _entry_for(self, connection_id: str) -> dict:
        """Presence entry of a connection (a lock holder may belong to another process)."""
        return self._page_connections.get(self.group_name, {}).get(connection_id) or {
            'connection_id': connection_id, 'user_id': None, 'username': '',
        }

    # ─── Connection lifecycle ───────────────────────────────

    async def connect(self):
        self.user = self.scope.get('user', AnonymousUser())

        # Reject unauthenticated connections
        if not self.user or isinstance(self.user, AnonymousUser) or not self.user.is_authenticated:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        # Verify the user has access to this page. Nothing below the checks
        # sets page_id/group_name, so a refused connection has nothing to clean up.
        page_id = self.scope['url_route']['kwargs']['page_id']
        page = await get_accessible_page(self.user, page_id)
        if page is None:
            await self.close(code=CLOSE_FORBIDDEN)
            return

        # The page owner's plan decides, not the plan of whoever connects
        if not await owner_has_collaboration(page.owner):
            await self.accept()
            await self.send_json({
                'type': 'error',
                'message': 'La colaboración en tiempo real está disponible en el plan Pro.',
                'code': 'plan_limit',
            })
            await self.close(code=CLOSE_FORBIDDEN)
            return

        group_name = f'page_{page.pk}'
        try:
            await self.channel_layer.group_add(group_name, self.channel_name)
        except Exception:
            logger.error('Failed to join channel group (is Redis running?)', exc_info=True)
            await self.close(code=CLOSE_SERVER_ERROR)
            return

        self.page_id = str(page.pk)
        self.group_name = group_name
        self.connection_id = uuid.uuid4().hex
        self.entry = {
            'connection_id': self.connection_id,
            'user_id': str(self.user.pk),
            'username': self.user.username,
        }
        self._presence()[self.connection_id] = self.entry
        self._joined = True

        await self.accept()

        try:
            locks = await self._lock_call('get_locks', self.page_id)
        except Exception:
            logger.warning('Could not read the locks of page %s', self.page_id, exc_info=True)
            locks = {}

        await self.send_json({
            'type': 'connected',
            'connection_id': self.connection_id,
            'users': list(self._presence().values()),
            'locks': {block_id: self._entry_for(holder) for block_id, holder in locks.items()},
            'version': page.version,
        })

        await self._safe_group_send({
            'type': 'broadcast_user_joined',
            'entry': self.entry,
            'sender_channel': self.channel_name,
        })

    async def disconnect(self, close_code):
        if not self._joined:
            return
        self._joined = False

        # Only THIS connection's locks: another tab of the same user keeps its own
        try:
            released_blocks = await self._lock_call('release_all_for_user', self.page_id, self.connection_id)
        except Exception:
            logger.warning('Could not release the locks of connection %s', self.connection_id, exc_info=True)
            released_blocks = []
        for block_id in released_blocks:
            await self._safe_group_send({'type': 'broadcast_lock_released', 'block_id': block_id, 'entry': self.entry})

        presence = self._page_connections.get(self.group_name)
        if presence is not None:
            presence.pop(self.connection_id, None)
            if not presence:
                del self._page_connections[self.group_name]

        await self._safe_group_send({
            'type': 'broadcast_user_left',
            'entry': self.entry,
            'sender_channel': self.channel_name,
        })

        try:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            logger.warning('Failed to leave channel group %s', self.group_name, exc_info=True)

    # ─── Incoming messages ──────────────────────────────────

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if text_data is None:
            return
        try:
            content = json.loads(text_data)
        except ValueError:
            await self._send_error('invalid_message', 'Mensaje no válido.')
            return
        await self.receive_json(content)

    async def receive_json(self, content, **kwargs):
        """Route incoming messages by type."""
        if not self._joined:
            return
        if not isinstance(content, dict):
            await self._send_error('invalid_message', 'Mensaje no válido.')
            return

        msg_type = content.get('type', '')

        handlers = {
            'ping': self.handle_ping,
            'lock_acquire': self.handle_lock_acquire,
            'lock_release': self.handle_lock_release,
            'lock_renew': self.handle_lock_renew,
            'block_updated': self.handle_block_updated,
            'cursor_move': self.handle_cursor_move,
        }

        handler = handlers.get(msg_type)
        if handler:
            await handler(content)
        else:
            await self._send_error('unknown_message_type', f'Tipo de mensaje desconocido: {msg_type}')

    async def _send_error(self, code: str, message: str) -> None:
        await self.send_json({'type': 'error', 'code': code, 'message': message})

    # ─── Handlers ───────────────────────────────────────────

    async def handle_ping(self, content):
        await self.send_json({'type': 'pong'})

    async def handle_lock_acquire(self, content):
        block_id = content.get('block_id')
        if not is_valid_block_id(block_id):
            return

        # A lock on a block that is not in this page would let a client squat
        # keys in the lock store and probe other pages
        if await get_block_type(self.page_id, block_id) is None:
            await self._send_error('block_not_found', 'El bloque no existe en esta página.')
            return

        if await self._lock_call('acquire', self.page_id, block_id, self.connection_id):
            await self._safe_group_send({'type': 'broadcast_lock_acquired', 'block_id': block_id, 'entry': self.entry})
        else:
            holder = await self._lock_call('get_lock_holder', self.page_id, block_id)
            await self.send_json({
                'type': 'lock_rejected',
                'block_id': block_id,
                'holder': self._entry_for(holder) if holder else None,
            })

    async def handle_lock_release(self, content):
        block_id = content.get('block_id')
        if not is_valid_block_id(block_id):
            return

        if await self._lock_call('release', self.page_id, block_id, self.connection_id):
            await self._safe_group_send({'type': 'broadcast_lock_released', 'block_id': block_id, 'entry': self.entry})

    async def handle_lock_renew(self, content):
        block_id = content.get('block_id')
        if not is_valid_block_id(block_id):
            return

        if await self._lock_call('renew', self.page_id, block_id, self.connection_id):
            return

        # The lock lapsed (renewals did not arrive within the TTL) while this
        # editor still has the block selected. Every other editor still shows
        # it as ours, so whatever happens next must reach the whole group
        # (QA-031): take it again, or tell the requester who has it now.
        if await get_block_type(self.page_id, block_id) is None:
            # The block is gone: nobody can hold it
            await self._safe_group_send({'type': 'broadcast_lock_released', 'block_id': block_id, 'entry': self.entry})
            return
        if await self._lock_call('acquire', self.page_id, block_id, self.connection_id):
            await self._safe_group_send({'type': 'broadcast_lock_acquired', 'block_id': block_id, 'entry': self.entry})
            return
        # Someone else took it after it lapsed; the others heard their lock_acquired
        holder = await self._lock_call('get_lock_holder', self.page_id, block_id)
        await self.send_json({
            'type': 'lock_rejected',
            'block_id': block_id,
            'holder': self._entry_for(holder) if holder else None,
        })

    async def handle_block_updated(self, content):
        block_id = content.get('block_id')
        if not is_valid_block_id(block_id):
            return

        # Verify this connection holds the lock
        holder = await self._lock_call('get_lock_holder', self.page_id, block_id)
        if holder != self.connection_id:
            await self._send_error('lock_required', 'No tienes el lock de este bloque.')
            return

        # Validate exactly like the REST API before relaying to other editors:
        # their editors render this data, so unsanitized input would be XSS.
        block_type = await get_block_type(self.page_id, block_id)
        if block_type is None:
            await self._send_error('block_not_found', 'El bloque no existe en esta página.')
            return

        data = content.get('data')
        if data is not None:
            try:
                data = clean_block_data(block_type, data, partial=True)
            except ValidationError as exc:
                await self._send_error('invalid_block_data', str(exc.detail))
                return

        styles = content.get('styles')
        if styles is not None:
            styles = clean_styles(styles)

        await self._safe_group_send({
            'type': 'broadcast_block_updated',
            'block_id': block_id,
            'data': data,
            'styles': styles,
            'entry': self.entry,
            'sender_channel': self.channel_name,
        })

    async def handle_cursor_move(self, content):
        x = clean_cursor_coordinate(content.get('x'))
        y = clean_cursor_coordinate(content.get('y'))
        if x is None or y is None:
            return

        await self._safe_group_send({
            'type': 'broadcast_cursor_moved',
            'entry': self.entry,
            'x': x,
            'y': y,
            'sender_channel': self.channel_name,
        })

    # ─── Group broadcast handlers ───────────────────────────

    async def broadcast_user_joined(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({'type': 'user_joined', **event['entry']})

    async def broadcast_user_left(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({'type': 'user_left', **event['entry']})

    async def broadcast_lock_acquired(self, event):
        await self.send_json({'type': 'lock_acquired', 'block_id': event['block_id'], **event['entry']})

    async def broadcast_lock_released(self, event):
        await self.send_json({'type': 'lock_released', 'block_id': event['block_id'], **event['entry']})

    async def broadcast_block_updated(self, event):
        # Don't send back to the sender
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({
            'type': 'block_updated',
            'block_id': event['block_id'],
            'data': event.get('data'),
            'styles': event.get('styles'),
            'connection_id': event['entry']['connection_id'],
            'user_id': event['entry']['user_id'],
        })

    async def broadcast_cursor_moved(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({
            'type': 'cursor_moved',
            **event['entry'],
            'x': event['x'],
            'y': event['y'],
        })

    async def page_updated(self, event):
        """Sent by the REST views after any write that bumps the page version
        (pages/sync.py). Channels dispatches 'page.updated' to this method;
        without a handler it would raise and drop every socket on the page."""
        await self.send_json({
            'type': 'page_updated',
            'version': event.get('version'),
            'reason': event.get('reason'),
            'by': event.get('by'),
            'connection_id': event.get('connection_id'),
        })

    async def access_revoked(self, event):
        """The owner removed a collaborator, or deleted the page: those open
        editors stop now. `user_id` names whose access ended; without it
        (page deleted) everyone's did. `reason: 'page_deleted'` tells the
        editor why, so it does not say the page was unshared."""
        if not self._joined:
            return
        user_id = event.get('user_id')
        if user_id is not None and str(self.user.pk) != user_id:
            return
        if event.get('reason') == REVOKED_PAGE_DELETED:
            await self._send_error('page_deleted', 'Esta página se ha eliminado.')
        else:
            await self._send_error('access_revoked', 'Ya no tienes acceso a esta página.')
        await self.close(code=CLOSE_FORBIDDEN)

"""
WebSocket consumer for real-time page collaboration.

Handles: authentication, room join/leave, block locks, presence,
change synchronization, and keepalive ping/pong.
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from .locks import LockManager

logger = logging.getLogger(__name__)


@database_sync_to_async
def user_has_collaboration(user) -> bool:
    """Check if the user's plan includes collaboration."""
    from billing.permissions import get_user_plan
    plan = get_user_plan(user)
    return getattr(plan, 'has_collaboration', False)


@database_sync_to_async
def user_can_access_page(user, page_id: str) -> bool:
    """Check if the user can access the page (must be owner or collaborator)."""
    from django.db.models import Q
    from pages.models import Page
    return Page.objects.filter(
        Q(owner=user) | Q(collaborators=user),
        pk=page_id,
    ).exists()


@database_sync_to_async
def get_user_info(user) -> dict:
    """Serialize minimal user info for presence broadcasts."""
    return {
        'id': str(user.pk),
        'username': user.username,
        'email': user.email,
        'avatar': getattr(user, 'avatar', ''),
    }


class PageConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for a single page editing session.

    URL: ws://.../ws/pages/{page_id}/?token=<jwt_access_token>

    Message protocol (client → server):
        { "type": "ping" }
        { "type": "lock_acquire", "block_id": "..." }
        { "type": "lock_release", "block_id": "..." }
        { "type": "lock_renew",   "block_id": "..." }
        { "type": "block_updated", "block_id": "...", "data": {...}, "styles": {...} }
        { "type": "cursor_move",  "x": 0.5, "y": 0.3 }

    Message protocol (server → client):
        { "type": "pong" }
        { "type": "connected", "user": {...}, "users": [...], "locks": {...} }
        { "type": "user_joined", "user": {...}, "users": [...] }
        { "type": "user_left",   "user": {...}, "users": [...] }
        { "type": "lock_acquired",  "block_id": "...", "user_id": "..." }
        { "type": "lock_released",  "block_id": "...", "user_id": "..." }
        { "type": "lock_rejected",  "block_id": "...", "holder_id": "..." }
        { "type": "block_updated",  "block_id": "...", "data": {...}, "styles": {...}, "user_id": "..." }
        { "type": "cursor_moved",   "user_id": "...", "x": 0.5, "y": 0.3 }
        { "type": "error", "message": "..." }
    """

    # Class-level dict to track connected users per page group
    # {group_name: {user_id: user_info}}
    _page_users: dict[str, dict[str, dict]] = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.page_id: str = ''
        self.group_name: str = ''
        self.user = None
        self.user_info: dict = {}
        self._lock_manager: LockManager | None = None

    @property
    def lock_manager(self) -> LockManager:
        if self._lock_manager is None:
            self._lock_manager = LockManager()
        return self._lock_manager

    async def connect(self):
        self.user = self.scope.get('user', AnonymousUser())

        # Reject unauthenticated connections
        if not self.user or isinstance(self.user, AnonymousUser) or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        # Check plan allows collaboration
        has_collab = await user_has_collaboration(self.user)
        if not has_collab:
            await self.accept()
            await self.send_json({
                'type': 'error',
                'message': 'La colaboración en tiempo real está disponible en el plan Pro.',
                'code': 'plan_limit',
            })
            await self.close(code=4003)
            return

        self.page_id = self.scope['url_route']['kwargs']['page_id']
        self.group_name = f'page_{self.page_id}'

        # Verify the user has access to this page
        has_access = await user_can_access_page(self.user, self.page_id)
        if not has_access:
            await self.close(code=4003)
            return

        try:
            # Join the channel group
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        except Exception as e:
            logger.error('Failed to join channel group (is Redis running?): %s', e)
            await self.close(code=4500)
            return

        await self.accept()

        # Track presence
        self.user_info = await get_user_info(self.user)
        user_id = str(self.user.pk)

        if self.group_name not in self._page_users:
            self._page_users[self.group_name] = {}
        self._page_users[self.group_name][user_id] = self.user_info

        # Get current locks
        locks = self.lock_manager.get_locks(self.page_id)

        # Send initial state to the connecting user
        await self.send_json({
            'type': 'connected',
            'user': self.user_info,
            'users': list(self._page_users[self.group_name].values()),
            'locks': locks,
        })

        # Broadcast join to others
        try:
            await self.channel_layer.group_send(self.group_name, {
                'type': 'broadcast_user_joined',
                'user': self.user_info,
                'sender_channel': self.channel_name,
            })
        except Exception as e:
            logger.warning('Failed to broadcast user_joined: %s', e)

    async def disconnect(self, close_code):
        if not self.page_id:
            return

        user_id = str(self.user.pk) if self.user and self.user.is_authenticated else None

        if user_id:
            # Release all locks held by this user
            released_blocks = self.lock_manager.release_all_for_user(self.page_id, user_id)
            for block_id in released_blocks:
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'broadcast_lock_released',
                    'block_id': block_id,
                    'user_id': user_id,
                })

            # Remove from presence
            if self.group_name in self._page_users:
                self._page_users[self.group_name].pop(user_id, None)
                if not self._page_users[self.group_name]:
                    del self._page_users[self.group_name]

            # Broadcast leave
            await self.channel_layer.group_send(self.group_name, {
                'type': 'broadcast_user_left',
                'user': self.user_info,
                'sender_channel': self.channel_name,
            })

        # Leave the group
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """Route incoming messages by type."""
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
            await self.send_json({
                'type': 'error',
                'message': f'Tipo de mensaje desconocido: {msg_type}',
            })

    # ─── Handlers ───────────────────────────────────────────

    async def handle_ping(self, content):
        await self.send_json({'type': 'pong'})

    async def handle_lock_acquire(self, content):
        block_id = content.get('block_id')
        if not block_id:
            return

        user_id = str(self.user.pk)
        acquired = self.lock_manager.acquire(self.page_id, block_id, user_id)

        if acquired:
            await self.channel_layer.group_send(self.group_name, {
                'type': 'broadcast_lock_acquired',
                'block_id': block_id,
                'user_id': user_id,
            })
        else:
            holder = self.lock_manager.get_lock_holder(self.page_id, block_id)
            await self.send_json({
                'type': 'lock_rejected',
                'block_id': block_id,
                'holder_id': holder or 'unknown',
            })

    async def handle_lock_release(self, content):
        block_id = content.get('block_id')
        if not block_id:
            return

        user_id = str(self.user.pk)
        released = self.lock_manager.release(self.page_id, block_id, user_id)

        if released:
            await self.channel_layer.group_send(self.group_name, {
                'type': 'broadcast_lock_released',
                'block_id': block_id,
                'user_id': user_id,
            })

    async def handle_lock_renew(self, content):
        block_id = content.get('block_id')
        if not block_id:
            return

        user_id = str(self.user.pk)
        renewed = self.lock_manager.renew(self.page_id, block_id, user_id)

        if not renewed:
            await self.send_json({
                'type': 'lock_released',
                'block_id': block_id,
                'user_id': user_id,
            })

    async def handle_block_updated(self, content):
        block_id = content.get('block_id')
        if not block_id:
            return

        user_id = str(self.user.pk)

        # Verify the user holds the lock
        holder = self.lock_manager.get_lock_holder(self.page_id, block_id)
        if holder != user_id:
            await self.send_json({
                'type': 'error',
                'message': 'No tienes el lock de este bloque.',
            })
            return

        # Broadcast to all other users
        await self.channel_layer.group_send(self.group_name, {
            'type': 'broadcast_block_updated',
            'block_id': block_id,
            'data': content.get('data'),
            'styles': content.get('styles'),
            'user_id': user_id,
            'sender_channel': self.channel_name,
        })

    async def handle_cursor_move(self, content):
        user_id = str(self.user.pk)

        await self.channel_layer.group_send(self.group_name, {
            'type': 'broadcast_cursor_moved',
            'user_id': user_id,
            'x': content.get('x', 0),
            'y': content.get('y', 0),
            'sender_channel': self.channel_name,
        })

    # ─── Group broadcast handlers ───────────────────────────

    async def broadcast_user_joined(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        users = list(self._page_users.get(self.group_name, {}).values())
        await self.send_json({
            'type': 'user_joined',
            'user': event['user'],
            'users': users,
        })

    async def broadcast_user_left(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        users = list(self._page_users.get(self.group_name, {}).values())
        await self.send_json({
            'type': 'user_left',
            'user': event['user'],
            'users': users,
        })

    async def broadcast_lock_acquired(self, event):
        await self.send_json({
            'type': 'lock_acquired',
            'block_id': event['block_id'],
            'user_id': event['user_id'],
        })

    async def broadcast_lock_released(self, event):
        await self.send_json({
            'type': 'lock_released',
            'block_id': event['block_id'],
            'user_id': event['user_id'],
        })

    async def broadcast_block_updated(self, event):
        # Don't send back to the sender
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({
            'type': 'block_updated',
            'block_id': event['block_id'],
            'data': event.get('data'),
            'styles': event.get('styles'),
            'user_id': event['user_id'],
        })

    async def broadcast_cursor_moved(self, event):
        if self.channel_name == event.get('sender_channel'):
            return
        await self.send_json({
            'type': 'cursor_moved',
            'user_id': event['user_id'],
            'x': event.get('x', 0),
            'y': event.get('y', 0),
        })

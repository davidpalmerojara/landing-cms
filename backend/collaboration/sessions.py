"""Ending the open collaboration sockets of a user (DATA-007).

A socket is authenticated once, at the handshake. When the session behind it
ends (logout, every session revoked, account deleted) the user's sockets are
told to close with CLOSE_SESSION_ENDED. That code is not final for the
editor: it reconnects at once with a fresh ticket, which only a browser that
still has a valid session can get. So another device of the same person
comes back after a moment, and the signed-out one stays out.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)

SESSION_ENDED_EVENT = 'session.ended'


def user_group_name(user_id) -> str:
    return f'user_{user_id}'


def _send(user_id) -> None:
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(user_group_name(user_id), {'type': SESSION_ENDED_EVENT})
    except Exception:
        # Best effort: the socket re-checks the session on its next ping anyway
        logger.warning('Failed to close the sockets of user %s', user_id, exc_info=True)


def close_user_sockets(user_id) -> None:
    """Close every open socket of the user once the current transaction commits (at once outside one)."""
    transaction.on_commit(lambda: _send(user_id))

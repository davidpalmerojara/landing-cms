"""
Redis-based pessimistic lock manager for block-level editing.

Each lock is a Redis key with format: lock:page:{page_id}:block:{block_id}
Value is the user_id who holds the lock. TTL is 30 seconds — the frontend
must renew periodically (every ~10s) to keep the lock alive.
"""

import json
import redis
from django.conf import settings

# Lua script for atomic release: only deletes the key if the value matches
RELEASE_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    redis.call('del', KEYS[1])
    return 1
end
return 0
"""

# Lua script for atomic renew: only extends TTL if the value matches
RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    redis.call('expire', KEYS[1], ARGV[2])
    return 1
end
return 0
"""

LOCK_TTL = 30  # seconds
LOCK_PREFIX = 'lock:page:'


def _get_redis():
    return redis.from_url(settings.REDIS_URL)


def _lock_key(page_id: str, block_id: str) -> str:
    return f'{LOCK_PREFIX}{page_id}:block:{block_id}'


class LockManager:
    """Manages block-level locks using Redis."""

    def __init__(self):
        self._redis = _get_redis()
        self._release_script = self._redis.register_script(RELEASE_SCRIPT)
        self._renew_script = self._redis.register_script(RENEW_SCRIPT)

    def acquire(self, page_id: str, block_id: str, user_id: str) -> bool:
        """
        Try to acquire a lock on a block.
        Returns True if acquired, False if already locked by another user.
        """
        key = _lock_key(page_id, block_id)
        # SET NX: only set if key doesn't exist
        acquired = self._redis.set(key, user_id, nx=True, ex=LOCK_TTL)
        if acquired:
            return True

        # Check if it's already ours (re-acquire = renew)
        current = self._redis.get(key)
        if current and current.decode('utf-8') == user_id:
            self._redis.expire(key, LOCK_TTL)
            return True

        return False

    def release(self, page_id: str, block_id: str, user_id: str) -> bool:
        """
        Release a lock only if it belongs to the given user.
        Returns True if released, False otherwise.
        """
        key = _lock_key(page_id, block_id)
        result = self._release_script(keys=[key], args=[user_id])
        return bool(result)

    def renew(self, page_id: str, block_id: str, user_id: str) -> bool:
        """
        Extend a lock's TTL only if it belongs to the given user.
        Returns True if renewed, False otherwise.
        """
        key = _lock_key(page_id, block_id)
        result = self._renew_script(keys=[key], args=[user_id, LOCK_TTL])
        return bool(result)

    def get_locks(self, page_id: str) -> dict:
        """
        Return all current locks for a page as {block_id: user_id}.
        """
        pattern = f'{LOCK_PREFIX}{page_id}:block:*'
        locks = {}
        for key in self._redis.scan_iter(match=pattern, count=100):
            key_str = key.decode('utf-8')
            block_id = key_str.rsplit(':block:', 1)[-1]
            value = self._redis.get(key)
            if value:
                locks[block_id] = value.decode('utf-8')
        return locks

    def release_all_for_user(self, page_id: str, user_id: str) -> list:
        """
        Release all locks held by a user on a page.
        Returns list of block_ids that were released.
        """
        pattern = f'{LOCK_PREFIX}{page_id}:block:*'
        released = []
        for key in self._redis.scan_iter(match=pattern, count=100):
            value = self._redis.get(key)
            if value and value.decode('utf-8') == user_id:
                self._redis.delete(key)
                key_str = key.decode('utf-8')
                block_id = key_str.rsplit(':block:', 1)[-1]
                released.append(block_id)
        return released

    def get_lock_holder(self, page_id: str, block_id: str) -> str | None:
        """Return the user_id holding the lock, or None."""
        key = _lock_key(page_id, block_id)
        value = self._redis.get(key)
        return value.decode('utf-8') if value else None

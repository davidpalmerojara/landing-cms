"""
Pessimistic lock manager for block-level editing.

Two implementations with the same interface:
- LockManager: Redis, shared by every server process (Lua for atomicity).
- InMemoryLockManager: a dict in this process. Used when REDIS_URL is not
  set, i.e. a single Daphne process (local development, free hosting).

Each lock is a Redis key with format: lock:page:{page_id}:block:{block_id}
Value is the user_id who holds the lock. TTL is 30 seconds — the frontend
must renew periodically (every ~10s) to keep the lock alive.
"""

import threading
import time

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


class InMemoryLockManager:
    """Same contract as LockManager, kept in process memory with TTLs."""

    def __init__(self):
        self._locks: dict[tuple[str, str], tuple[str, float]] = {}
        self._mutex = threading.Lock()

    def _holder(self, page_id: str, block_id: str) -> str | None:
        entry = self._locks.get((page_id, block_id))
        if entry is None:
            return None
        user_id, expires_at = entry
        if expires_at <= time.monotonic():
            del self._locks[(page_id, block_id)]
            return None
        return user_id

    def acquire(self, page_id: str, block_id: str, user_id: str) -> bool:
        with self._mutex:
            holder = self._holder(page_id, block_id)
            if holder not in (None, user_id):
                return False
            self._locks[(page_id, block_id)] = (user_id, time.monotonic() + LOCK_TTL)
            return True

    def release(self, page_id: str, block_id: str, user_id: str) -> bool:
        with self._mutex:
            if self._holder(page_id, block_id) != user_id:
                return False
            del self._locks[(page_id, block_id)]
            return True

    def renew(self, page_id: str, block_id: str, user_id: str) -> bool:
        with self._mutex:
            if self._holder(page_id, block_id) != user_id:
                return False
            self._locks[(page_id, block_id)] = (user_id, time.monotonic() + LOCK_TTL)
            return True

    def get_locks(self, page_id: str) -> dict:
        with self._mutex:
            keys = [key for key in self._locks if key[0] == page_id]
            return {block_id: holder for (_, block_id) in keys if (holder := self._holder(page_id, block_id))}

    def release_all_for_user(self, page_id: str, user_id: str) -> list:
        with self._mutex:
            mine = [key for key, (holder, _) in self._locks.items() if key[0] == page_id and holder == user_id]
            for key in mine:
                del self._locks[key]
            return [block_id for (_, block_id) in mine]

    def get_lock_holder(self, page_id: str, block_id: str) -> str | None:
        with self._mutex:
            return self._holder(page_id, block_id)


_in_memory_manager = InMemoryLockManager()


def get_lock_manager():
    """Redis when REDIS_URL is configured, otherwise the process-wide in-memory manager."""
    if settings.REDIS_ENABLED:
        return LockManager()
    return _in_memory_manager

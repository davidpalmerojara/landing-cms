from unittest.mock import patch

import pytest

from collaboration import locks
from collaboration.locks import InMemoryLockManager, LockManager, get_lock_manager


@pytest.fixture
def manager():
    return InMemoryLockManager()


def test_lock_is_exclusive_until_released(manager):
    assert manager.acquire('p', 'b', 'ana')
    assert not manager.acquire('p', 'b', 'luis')
    assert manager.get_lock_holder('p', 'b') == 'ana'

    assert not manager.release('p', 'b', 'luis')  # only the holder can release
    assert manager.release('p', 'b', 'ana')
    assert manager.acquire('p', 'b', 'luis')


def test_reacquiring_own_lock_succeeds(manager):
    assert manager.acquire('p', 'b', 'ana')
    assert manager.acquire('p', 'b', 'ana')


def test_lock_expires_after_ttl(manager):
    with patch.object(locks.time, 'monotonic', return_value=1000.0):
        manager.acquire('p', 'b', 'ana')
    with patch.object(locks.time, 'monotonic', return_value=1000.0 + locks.LOCK_TTL + 1):
        assert manager.get_lock_holder('p', 'b') is None
        assert manager.acquire('p', 'b', 'luis')


def test_renew_extends_only_the_holders_lock(manager):
    with patch.object(locks.time, 'monotonic', return_value=1000.0):
        manager.acquire('p', 'b', 'ana')
    with patch.object(locks.time, 'monotonic', return_value=1020.0):
        assert not manager.renew('p', 'b', 'luis')
        assert manager.renew('p', 'b', 'ana')
    with patch.object(locks.time, 'monotonic', return_value=1045.0):
        assert manager.get_lock_holder('p', 'b') == 'ana'


def test_get_locks_and_release_all_are_scoped_to_page_and_user(manager):
    manager.acquire('p1', 'b1', 'ana')
    manager.acquire('p1', 'b2', 'luis')
    manager.acquire('p2', 'b3', 'ana')

    assert manager.get_locks('p1') == {'b1': 'ana', 'b2': 'luis'}
    assert manager.release_all_for_user('p1', 'ana') == ['b1']
    assert manager.get_locks('p1') == {'b2': 'luis'}
    assert manager.get_locks('p2') == {'b3': 'ana'}


def test_uses_memory_without_redis_and_redis_when_configured(settings):
    settings.REDIS_ENABLED = False
    assert isinstance(get_lock_manager(), InMemoryLockManager)
    assert get_lock_manager() is get_lock_manager()  # shared by every consumer in the process

    settings.REDIS_ENABLED = True
    with patch.object(locks, '_get_redis'):
        assert isinstance(get_lock_manager(), LockManager)

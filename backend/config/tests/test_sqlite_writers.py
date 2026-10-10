"""COLLAB2-003: on SQLite, two whole-page writes at once answered 500 "database is locked".

Each one read and then wrote inside `transaction.atomic()`. A deferred
transaction that already read cannot wait for another writer, so SQLite failed
it at once. With `transaction_mode: IMMEDIATE` the second writer waits at BEGIN
until the first commits. This runs the same pattern on a real database file,
with the project's connection settings.
"""
import threading
import time

import pytest
from django.conf import settings
from django.db import connections, transaction
from django.db.backends.sqlite3.base import DatabaseWrapper

ALIAS = 'sqlite_writers_probe'

pytestmark = pytest.mark.skipif(
    settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3',
    reason='SQLite only: PostgreSQL waits on row locks',
)


def open_connection(path):
    settings_dict = {
        **connections['default'].settings_dict,
        'NAME': str(path),
        'OPTIONS': settings.DATABASES['default'].get('OPTIONS', {}),
    }
    return DatabaseWrapper(settings_dict, alias=ALIAS)


def read_then_write(path, errors, pause):
    """What restore and AI generation do: read inside the transaction, then write."""
    wrapper = open_connection(path)
    connections[ALIAS] = wrapper
    try:
        with transaction.atomic(using=ALIAS):
            with wrapper.cursor() as cursor:
                cursor.execute('SELECT n FROM counter')
                (value,) = cursor.fetchone()
                time.sleep(pause)  # the other writer arrives meanwhile
                cursor.execute('UPDATE counter SET n = %s', [value + 1])
    except Exception as exc:  # noqa: BLE001 - collected and asserted below
        errors.append(exc)
    finally:
        wrapper.close()
        del connections[ALIAS]


def test_collab2_003_two_writers_queue_instead_of_failing(tmp_path, django_db_blocker):
    with django_db_blocker.unblock():  # its own database file, not the test database
        run_two_writers(tmp_path / 'writers.sqlite3')


def run_two_writers(path):
    setup = open_connection(path)
    with setup.cursor() as cursor:
        cursor.execute('CREATE TABLE counter (n integer)')
        cursor.execute('INSERT INTO counter VALUES (0)')
    setup.close()

    errors = []
    first = threading.Thread(target=read_then_write, args=(path, errors, 0.4))
    second = threading.Thread(target=read_then_write, args=(path, errors, 0))
    first.start()
    time.sleep(0.1)
    second.start()
    first.join()
    second.join()

    assert errors == []
    check = open_connection(path)
    with check.cursor() as cursor:
        cursor.execute('SELECT n FROM counter')
        assert cursor.fetchone() == (2,)  # both increments landed, one after the other
    check.close()

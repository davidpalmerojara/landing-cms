"""A last guard for the free database (SEC-001, ADR-053).

When PostgreSQL grows past DATABASE_SIZE_LIMIT_MB, new guests and sign-ups get
`503 SERVICE_FULL` instead of letting the provider's storage limit stop every
write (saves, token rotation) for everyone. Existing accounts keep working.
SQLite (development, e2e) is never "full".
"""
import logging

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from rest_framework import status
from rest_framework.exceptions import APIException

from .messages import message

logger = logging.getLogger(__name__)

SIZE_CACHE_KEY = 'database_size_bytes'
SIZE_CACHE_SECONDS = 300


class ServiceFull(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'SERVICE_FULL'

    def __init__(self):
        super().__init__(detail={'error': message('service_full'), 'code': 'SERVICE_FULL'})


def database_size_bytes() -> int | None:
    """Size of the PostgreSQL database, cached for a few minutes. None on other databases."""
    if connection.vendor != 'postgresql':
        return None
    size = cache.get(SIZE_CACHE_KEY)
    if size is None:
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_database_size(current_database())')
            size = cursor.fetchone()[0]
        cache.set(SIZE_CACHE_KEY, size, SIZE_CACHE_SECONDS)
    return size


def database_is_full() -> bool:
    size = database_size_bytes()
    if size is None:
        return False
    full = size >= settings.DATABASE_SIZE_LIMIT_MB * 1024 * 1024
    if full:
        logger.error('The database is %s MB, past DATABASE_SIZE_LIMIT_MB: new guests and sign-ups are refused',
                     size // (1024 * 1024))
    return full


def refuse_new_accounts_when_full() -> None:
    if database_is_full():
        raise ServiceFull()

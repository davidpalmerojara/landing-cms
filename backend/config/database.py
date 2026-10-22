"""Database settings from DATABASE_URL (CODE-002, DATA-001, PERF-006)."""
import urllib.parse


def postgres_config(database_url: str) -> dict:
    """DATABASES['default'] for a postgres://user:pass@host:5432/name?sslmode=require URL.

    - CONN_MAX_AGE=0: under ASGI every request runs in its own short-lived thread and
      persistent connections are per thread, so they are never reused or closed
      (measured: 15 idle connections became 49 after a burst of 40 requests, and
      Neon's free plan has a hard cap). A connection per request is the honest model;
      Neon's pooled endpoint (host with `-pooler`) makes it cheap.
    - DISABLE_SERVER_SIDE_CURSORS=True: PgBouncer in transaction mode (the pooled
      endpoint) cannot keep a server-side cursor between statements, and the data
      migrations use `.iterator()`. Harmless on a direct connection.
    """
    url = urllib.parse.urlparse(database_url)
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': url.path[1:],
        'USER': urllib.parse.unquote(url.username or ''),
        'PASSWORD': urllib.parse.unquote(url.password or ''),
        'HOST': url.hostname,
        'PORT': url.port or 5432,
        # Query parameters (e.g. sslmode=require for Neon) go to the driver
        'OPTIONS': dict(urllib.parse.parse_qsl(url.query)),
        'CONN_MAX_AGE': 0,
        'DISABLE_SERVER_SIDE_CURSORS': True,
    }

"""Cookieless, privacy-preserving helpers for analytics collection.

Nothing here stores or returns the IP address or the raw user agent. The only
derived value is a truncated hash that changes every UTC day.
"""
import hashlib
import hmac
import math
from datetime import date, timezone as dt_timezone
from urllib.parse import urlsplit

from django.conf import settings
from django.utils import timezone
from rest_framework.throttling import BaseThrottle

VISITOR_HASH_LENGTH = 16
MAX_PATH_LENGTH = 512
MAX_HREF_LENGTH = 2048
# A visit longer than a day is not a visit: also keeps sums of stored values finite
MAX_SECONDS_ON_PAGE = 86_400


def daily_salt(day: date) -> bytes:
    """Salt derived from SECRET_KEY and the UTC date; different every day."""
    return hmac.new(
        settings.SECRET_KEY.encode(),
        f'paxl-analytics-salt:{day.isoformat()}'.encode(),
        hashlib.sha256,
    ).digest()


def daily_visitor_hash(request, page_id) -> str:
    """sha256(daily_salt + ip + user_agent + page_id), truncated.

    The IP follows DRF's NUM_PROXIES logic (BaseThrottle.get_ident), so a
    client cannot choose its own identity via X-Forwarded-For.
    """
    day = timezone.now().astimezone(dt_timezone.utc).date()
    ip = BaseThrottle().get_ident(request) or ''
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    digest = hashlib.sha256(
        daily_salt(day)
        + b'|' + ip.encode()
        + b'|' + user_agent.encode()
        + b'|' + str(page_id).encode()
    ).hexdigest()
    return digest[:VISITOR_HASH_LENGTH]


def referrer_origin(referrer):
    """Keep only scheme + host (+ port) of the referring page."""
    if not referrer:
        return None
    try:
        parts = urlsplit(referrer)
    except ValueError:
        return None
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        return None
    return f'{parts.scheme}://{parts.netloc.rsplit("@", 1)[-1]}'


def _path_only(url):
    """Path of a URL without query string or fragment."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    return (parts.path or '/')[:MAX_PATH_LENGTH]


def _safe_href(href):
    """Allow http(s) or relative links only; drop query, fragment and credentials."""
    if not isinstance(href, str) or not href.strip():
        return None
    try:
        parts = urlsplit(href.strip())
    except ValueError:
        return None
    if parts.scheme and parts.scheme not in ('http', 'https'):
        return None
    if parts.scheme:
        host = parts.netloc.rsplit('@', 1)[-1]
        return f'{parts.scheme}://{host}{parts.path}'[:MAX_HREF_LENGTH]
    if parts.netloc:
        return None
    return parts.path[:MAX_HREF_LENGTH] or None


def is_finite_number(value) -> bool:
    """A JSON number that is not inf or NaN. Integers are always finite, and
    math.isfinite raises OverflowError on one too big for a float (10**400 is
    valid JSON), which used to answer the public collect endpoint with a 500 (SEC2-005)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value)


def sanitize_event_data(event_type, data):
    """Whitelist event_data per event type so extra fields are never stored."""
    data = data if isinstance(data, dict) else {}
    if event_type == 'pageview':
        url = data.get('path') or data.get('url')
        path = _path_only(url) if isinstance(url, str) else None
        return {'path': path} if path else {}
    if event_type in ('click', 'cta_conversion'):
        href = _safe_href(data.get('href'))
        return {'href': href} if href else {}
    if event_type == 'scroll_depth':
        depth = data.get('depth')
        return {'depth': depth} if depth in (25, 50, 75, 100) else {}
    if event_type == 'time_on_page':
        seconds = data.get('seconds')
        out = {}
        if is_finite_number(seconds):
            out['seconds'] = min(max(seconds, 0), MAX_SECONDS_ON_PAGE)
        if data.get('type') in ('heartbeat', 'exit'):
            out['type'] = data['type']
        return out
    return {}

"""Which address is the visitor's, behind Vercel and Render (SEC-002, ADR-050).

In production a visitor's request travels visitor -> Vercel (rewrite of /api and
/media) -> Render's router -> Daphne. Vercel overwrites `X-Forwarded-For` with the
visitor's address and Render appends the address it saw (Vercel's), so a request
that came through Vercel reaches us as `X-Forwarded-For: <visitor>, <vercel>`.

The Render service is also public on its own address (the WebSocket needs it), so
anyone can call it directly and send any `X-Forwarded-For` they like. The only way
to tell the two paths apart is a secret that Vercel adds on the rewrite
(`ORIGIN_SECRET`, header `X-Paxl-Origin-Secret`):

- with the secret: the address is entry `-NUM_PROXIES` of `X-Forwarded-For` (2: the
  visitor, then Vercel's egress);
- without it (a direct call, or a server-side call from Vercel's functions): the
  header is the caller's to write, so only the entries the platform appended count:
  `DIRECT_PROXY_HOPS` (1 on Render: the address its router saw), or none (the
  socket address) when it is 0, the default for local development.

`ClientIPMiddleware` writes the result into `REMOTE_ADDR` and removes
`X-Forwarded-For`, so DRF's throttles, the analytics visitor hash, the admin login
limit and anything added later read one trusted value without knowing about proxies.
"""
import hmac
import ipaddress
import logging

from django.conf import settings

ORIGIN_SECRET_HEADER = 'X-Paxl-Origin-Secret'
ORIGIN_SECRET_META = 'HTTP_X_PAXL_ORIGIN_SECRET'
PEER_ADDR_META = 'PAXL_PEER_ADDR'

logger = logging.getLogger('paxl.client_ip')


def came_through_the_frontend(meta) -> bool:
    """True when the request carries the secret the frontend host adds on its rewrite."""
    secret = settings.ORIGIN_SECRET
    sent = meta.get(ORIGIN_SECRET_META, '')
    if not secret or not sent:
        return False
    return hmac.compare_digest(sent.encode(), secret.encode())


def _valid_address(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def client_ip(meta) -> str:
    """The visitor's address for rate limits and the daily visitor hash."""
    peer = meta.get('REMOTE_ADDR', '') or ''
    forwarded = [part for part in meta.get('HTTP_X_FORWARDED_FOR', '').split(',') if part.strip()]
    hops = settings.NUM_PROXIES if came_through_the_frontend(meta) else settings.DIRECT_PROXY_HOPS
    if hops <= 0 or not forwarded:
        return peer
    chosen = forwarded[-min(hops, len(forwarded))]
    # A malformed entry would become a cache key: fall back to the socket address
    return _valid_address(chosen) or peer


class ClientIPMiddleware:
    """Replaces REMOTE_ADDR with the trusted client address (see the module doc)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        meta = request.META
        peer = meta.get('REMOTE_ADDR', '')
        address = client_ip(meta)
        if settings.LOG_CLIENT_IP:
            logger.warning(
                'client-ip peer=%s x-forwarded-for=%r secret=%s chosen=%s path=%s',
                peer, meta.get('HTTP_X_FORWARDED_FOR', ''), came_through_the_frontend(meta), address, request.path,
            )
        meta[PEER_ADDR_META] = peer
        meta['REMOTE_ADDR'] = address
        meta.pop('HTTP_X_FORWARDED_FOR', None)
        meta.pop(ORIGIN_SECRET_META, None)
        return self.get_response(request)

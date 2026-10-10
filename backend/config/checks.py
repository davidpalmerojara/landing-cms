"""System checks for settings that are safe in development and dangerous in production.

`manage.py check` (and so `migrate`, which the release step runs) fails on the
errors; `config/asgi.py` runs the same checks when the server starts with
DEBUG off, so a bad deploy does not come up half working. `check --deploy`
adds the warnings.
"""
from django.conf import settings
from django.core.checks import Error, Tags, Warning, register

from config.features import stripe_key_is_live

LOCAL_HOSTS = ('localhost', '127.0.0.1', '[::1]')


@register(Tags.security)
def check_trusted_proxies(app_configs, **kwargs):
    """Rate limits and the analytics visitor hash read the client address from here (QA-007).

    Behind a proxy (every hosted deploy) the connection address is the proxy:
    with NUM_PROXIES=0 all visitors share one bucket, so five guest sessions per
    hour or five contact messages per minute lock out the whole site.
    """
    proxies = settings.REST_FRAMEWORK.get('NUM_PROXIES')
    if isinstance(proxies, int) and proxies < 0:
        # Never valid: DRF would pick an address from the wrong end of X-Forwarded-For (SEC2-011)
        return [Error(
            f'NUM_PROXIES is negative ({proxies}).',
            hint='Set NUM_PROXIES to the number of proxies between the visitor and this server (0 or more).',
            id='paxl.E001',
        )]
    if settings.DEBUG:
        return []
    if proxies:
        return []
    return [Error(
        'NUM_PROXIES is 0 or unset while DEBUG is off.',
        hint=(
            'Set NUM_PROXIES to the number of proxies between the visitor and this server '
            '(for example 2: the frontend host that rewrites /api, and the platform router). '
            'Too low and every visitor shares one rate-limit bucket; too high and a client can '
            'spoof its address with X-Forwarded-For. Check it with a temporary log of '
            'REMOTE_ADDR and X-Forwarded-For on the deployed stack.'
        ),
        id='paxl.E001',
    )]


@register(Tags.security)
def check_stripe_key_is_not_live(app_configs, **kwargs):
    """The demo never takes real payments (D2): a live Stripe key stops the deploy."""
    if stripe_key_is_live(settings.STRIPE_SECRET_KEY):
        return [Error(
            'STRIPE_SECRET_KEY is a live key (sk_live_…).',
            hint='Use a Stripe test key (sk_test_…) or leave it empty to keep billing off.',
            id='paxl.E002',
        )]
    return []


@register(Tags.security, deploy=True)
def check_deployment_settings(app_configs, **kwargs):
    problems = []
    if settings.SECRET_KEY.startswith('django-insecure'):
        problems.append(Error('DJANGO_SECRET_KEY is the development key.', id='paxl.E003'))
    if any(host == '*' for host in settings.ALLOWED_HOSTS):
        problems.append(Warning(
            "DJANGO_ALLOWED_HOSTS contains '*'.", hint='List the real hostnames.', id='paxl.W001',
        ))
    origins = settings.CSRF_TRUSTED_ORIGINS
    if not origins or all(any(local in origin for local in LOCAL_HOSTS) for origin in origins):
        problems.append(Warning(
            'CSRF_TRUSTED_ORIGINS only lists local addresses.',
            hint='Set CSRF_TRUSTED_ORIGINS (or CORS_ALLOWED_ORIGINS) to the public frontend origin; '
                 'sign-in and every write from the browser are rejected otherwise.',
            id='paxl.W002',
        ))
    if not settings.REVALIDATE_SECRET:
        problems.append(Warning(
            'REVALIDATE_SECRET is empty: published pages are not refreshed after publishing.',
            id='paxl.W003',
        ))
    if settings.ADMIN_ENABLED and settings.ADMIN_URL_PATH == 'admin/':
        problems.append(Warning(
            'The Django admin is on at the default path /admin/.',
            hint='Set ADMIN_URL_PATH to something else, or leave ADMIN_ENABLED off.',
            id='paxl.W004',
        ))
    return problems

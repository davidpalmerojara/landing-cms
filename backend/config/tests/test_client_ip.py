"""The visitor's address behind Vercel and Render (SEC-002, ADR-055)."""
import logging

import pytest
from django.http import HttpResponse
from django.test import RequestFactory
from rest_framework.throttling import BaseThrottle

from config.checks import check_origin_secret
from config.client_ip import ClientIPMiddleware, client_ip

SECRET = 's3cret-' + 'x' * 40
VISITOR = '198.51.100.20'
VERCEL_EGRESS = '76.76.21.9'
ROUTER = '10.0.0.7'


@pytest.fixture
def proxied(settings):
    """Vercel + Render: two hops with the secret, one hop for a direct call."""
    settings.ORIGIN_SECRET = SECRET
    settings.NUM_PROXIES = 2
    settings.DIRECT_PROXY_HOPS = 1


def through_middleware(headers=None, remote_addr=ROUTER):
    """Run a request through ClientIPMiddleware and return the request the view saw."""
    seen = {}

    def view(request):
        seen['request'] = request
        return HttpResponse('ok')

    request = RequestFactory().get('/api/pages/', REMOTE_ADDR=remote_addr, **(headers or {}))
    ClientIPMiddleware(view)(request)
    return seen['request']


class TestWithTheSecret:
    def test_sec002_the_visitor_is_the_entry_before_the_frontend_hosts_egress(self, proxied):
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
            'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
        })

        assert request.META['REMOTE_ADDR'] == VISITOR

    def test_sec002_a_visitor_cannot_choose_the_address_through_the_rewrite(self, proxied):
        """Vercel overwrites the header, so what a client sent is the entry before its own address."""
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
            'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
        })

        assert request.META['REMOTE_ADDR'] != VERCEL_EGRESS

    def test_sec002_ipv6_addresses_are_kept(self, proxied):
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
            'HTTP_X_FORWARDED_FOR': '2001:db8::1, 76.76.21.9',
        })

        assert request.META['REMOTE_ADDR'] == '2001:db8::1'


class TestWithoutTheSecret:
    def test_sec002_a_direct_call_cannot_forge_its_address(self, proxied):
        """Called straight at the public Render URL, the first entries are the caller's own text:
        only the address the platform appended counts (this chose the address before)."""
        request = through_middleware({
            'HTTP_X_FORWARDED_FOR': f'203.0.113.99, 203.0.113.98, {VISITOR}',
        })

        assert request.META['REMOTE_ADDR'] == VISITOR

    def test_sec002_a_wrong_secret_is_a_direct_call(self, proxied):
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': 'guess',
            'HTTP_X_FORWARDED_FOR': f'203.0.113.99, {VISITOR}',
        })

        assert request.META['REMOTE_ADDR'] == VISITOR

    def test_sec002_with_no_platform_hops_only_the_socket_address_counts(self, settings):
        settings.ORIGIN_SECRET = ''
        settings.NUM_PROXIES = 2
        settings.DIRECT_PROXY_HOPS = 0

        request = through_middleware({'HTTP_X_FORWARDED_FOR': '203.0.113.99, 203.0.113.98'}, remote_addr='192.0.2.5')

        assert request.META['REMOTE_ADDR'] == '192.0.2.5'

    def test_sec002_the_secret_is_never_accepted_when_none_is_configured(self, settings):
        """An empty configured secret must not match an empty or missing header."""
        settings.ORIGIN_SECRET = ''
        settings.NUM_PROXIES = 2
        settings.DIRECT_PROXY_HOPS = 0

        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': '',
            'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
        }, remote_addr='192.0.2.5')

        assert request.META['REMOTE_ADDR'] == '192.0.2.5'

    def test_sec002_a_malformed_entry_falls_back_to_the_socket_address(self, proxied):
        request = through_middleware({'HTTP_X_FORWARDED_FOR': 'not-an-address'})

        assert request.META['REMOTE_ADDR'] == ROUTER

    def test_sec002_no_header_means_the_socket_address(self, proxied):
        assert through_middleware().META['REMOTE_ADDR'] == ROUTER


class TestWhatTheRestOfTheAppSees:
    def test_sec002_drf_throttles_read_the_trusted_address(self, proxied, rf):
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
            'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
        })

        assert BaseThrottle().get_ident(request) == VISITOR

    def test_sec002_the_forwarded_header_and_the_secret_are_removed_and_the_peer_is_kept(self, proxied):
        request = through_middleware({
            'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
            'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
        })

        assert 'HTTP_X_FORWARDED_FOR' not in request.META
        assert 'HTTP_X_PAXL_ORIGIN_SECRET' not in request.META
        assert request.META['PAXL_PEER_ADDR'] == ROUTER

    @pytest.mark.django_db
    def test_sec002_a_throttled_endpoint_cannot_be_reset_with_a_forged_header(self, client, settings):
        """End to end through the real middleware stack: one caller, a new forged address each time."""
        settings.ORIGIN_SECRET = SECRET
        settings.NUM_PROXIES = 2
        settings.DIRECT_PROXY_HOPS = 0
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.AnonRateThrottle'],
            'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'anon': '3/minute'},
        }
        from rest_framework.throttling import AnonRateThrottle
        AnonRateThrottle.THROTTLE_RATES = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']

        statuses = [
            client.get('/api/billing/plans/', HTTP_X_FORWARDED_FOR=f'203.0.113.{i}, 203.0.113.200').status_code
            for i in range(5)
        ]

        assert statuses[-1] == 429


class TestDiagnostic:
    def test_log_client_ip_reports_the_hops_and_the_choice(self, proxied, settings, caplog):
        settings.LOG_CLIENT_IP = True

        with caplog.at_level(logging.WARNING, logger='paxl.client_ip'):
            through_middleware({
                'HTTP_X_PAXL_ORIGIN_SECRET': SECRET,
                'HTTP_X_FORWARDED_FOR': f'{VISITOR}, {VERCEL_EGRESS}',
            })

        message = caplog.records[-1].getMessage()
        assert f'peer={ROUTER}' in message
        assert VERCEL_EGRESS in message
        assert 'secret=True' in message
        assert f'chosen={VISITOR}' in message
        assert SECRET not in message

    def test_nothing_is_logged_by_default(self, proxied, caplog):
        with caplog.at_level(logging.WARNING, logger='paxl.client_ip'):
            through_middleware()

        assert caplog.records == []


class TestOriginSecretCheck:
    def test_sec002_a_production_deploy_without_the_secret_is_warned(self, settings):
        settings.DEBUG = False
        settings.NUM_PROXIES = 2
        settings.ORIGIN_SECRET = ''

        assert [p.id for p in check_origin_secret(None)] == ['paxl.W010']

    @pytest.mark.parametrize('debug, proxies, secret', [(False, 2, SECRET), (True, 0, ''), (False, 0, '')])
    def test_it_is_quiet_when_there_is_nothing_to_warn_about(self, settings, debug, proxies, secret):
        settings.DEBUG = debug
        settings.NUM_PROXIES = proxies
        settings.ORIGIN_SECRET = secret

        assert check_origin_secret(None) == []


def test_client_ip_helper_accepts_a_plain_meta_dict(proxied):
    assert client_ip({'REMOTE_ADDR': ROUTER}) == ROUTER

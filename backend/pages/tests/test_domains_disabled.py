"""Custom domains are behind CUSTOM_DOMAINS_ENABLED (ADR-027)."""
from unittest.mock import patch

import pytest
from django.core.management import call_command
from rest_framework import status

from pages.models import CustomDomain
from pages.serializers import CustomDomainSerializer
from pages.tests.test_domains import make_paid_user
from tests.factories import CustomDomainFactory, PageFactory

SOME_DOMAIN_ID = '00000000-0000-4000-8000-000000000000'


@pytest.mark.django_db
class TestCustomDomainsDisabled:
    @pytest.fixture(autouse=True)
    def custom_domains_off(self, settings):
        settings.CUSTOM_DOMAINS_ENABLED = False

    @pytest.mark.parametrize('method, path', [
        ('get', '/api/domains/'),
        ('post', '/api/domains/'),
        ('get', f'/api/domains/{SOME_DOMAIN_ID}/'),
        ('delete', f'/api/domains/{SOME_DOMAIN_ID}/'),
        ('post', f'/api/domains/{SOME_DOMAIN_ID}/verify/'),
    ])
    def test_domain_endpoints_answer_404_feature_disabled(self, auth_client, method, path):
        resp = getattr(auth_client, method)(path, {'domain': 'landing.example.com'}, format='json')

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'FEATURE_DISABLED'
        assert resp.data['error']

    def test_a_paid_user_cannot_use_it_either(self, api_client):
        user, *_ = make_paid_user()
        api_client.force_authenticate(user=user)

        resp = api_client.post('/api/domains/', {'domain': 'landing.example.com'}, format='json')

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert not CustomDomain.objects.exists()

    def test_the_answer_does_not_depend_on_being_signed_in(self, api_client):
        resp = api_client.get('/api/domains/')

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'FEATURE_DISABLED'

    def test_resolve_domain_is_disabled_too(self, api_client):
        page = PageFactory(status='published')
        _, workspace, *_ = make_paid_user()
        CustomDomainFactory(workspace=workspace, page=page, domain='live.example.com', is_active=True)

        resp = api_client.get('/api/public/resolve-domain/', {'domain': 'live.example.com'})

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'FEATURE_DISABLED'

    def test_the_periodic_check_does_nothing(self, capsys):
        _, workspace, *_ = make_paid_user()
        CustomDomainFactory(workspace=workspace, domain='pending.example.com')

        with patch('socket.gethostbyname') as resolve:
            call_command('check_domains')

        resolve.assert_not_called()
        assert 'disabled' in capsys.readouterr().out


@pytest.mark.django_db
class TestFeaturesEndpoint:
    def test_reports_custom_domains_off_and_needs_no_login(self, api_client, settings):
        settings.CUSTOM_DOMAINS_ENABLED = False

        resp = api_client.get('/api/features/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()['custom_domains'] is False

    def test_reports_it_on_when_the_deployment_enables_it(self, api_client, settings):
        settings.CUSTOM_DOMAINS_ENABLED = True

        assert api_client.get('/api/features/').json()['custom_domains'] is True


class TestDomainSettings:
    def test_dns_targets_come_from_settings(self, settings):
        settings.CUSTOM_DOMAINS_CNAME_TARGET = 'domains.example.org'
        settings.CUSTOM_DOMAINS_A_RECORD = '203.0.113.99'

        instructions = CustomDomainSerializer().get_dns_instructions(type('Domain', (), {'domain': 'shop.example.com'})())

        assert instructions['cname']['value'] == 'domains.example.org'
        assert instructions['alternative_a_record']['value'] == '203.0.113.99'

    @pytest.mark.django_db
    def test_reserved_domains_and_their_subdomains_are_refused(self, settings):
        settings.CUSTOM_DOMAINS_RESERVED = ['paxl.example.org']

        for domain in ('paxl.example.org', 'app.paxl.example.org'):
            serializer = CustomDomainSerializer(data={'domain': domain})
            serializer.is_valid()
            assert 'domain' in serializer.errors

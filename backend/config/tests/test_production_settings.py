"""Settings that are fine in development and unsafe behind a proxy in production (QA-007, QA-102)."""
import pytest
from django.core.checks import Error, Warning
from django.http import HttpResponse
from django.test import RequestFactory

from config.admin_guard import limit_admin_login
from config.checks import check_deployment_settings, check_trusted_proxies


def with_proxies(settings, count):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, 'NUM_PROXIES': count}


class TestTrustedProxiesCheck:
    def test_qa007_zero_proxies_stop_a_production_start(self, settings):
        settings.DEBUG = False
        with_proxies(settings, 0)

        problems = check_trusted_proxies(None)

        assert [p.id for p in problems] == ['paxl.E001']
        assert isinstance(problems[0], Error)
        assert 'NUM_PROXIES' in problems[0].msg

    def test_qa007_a_real_hop_count_passes(self, settings):
        settings.DEBUG = False
        with_proxies(settings, 2)

        assert check_trusted_proxies(None) == []

    def test_qa007_development_does_not_need_it(self, settings):
        settings.DEBUG = True
        with_proxies(settings, 0)

        assert check_trusted_proxies(None) == []


class TestDeploymentChecks:
    def test_a_sane_deployment_has_no_findings(self, settings):
        settings.SECRET_KEY = 'x' * 60
        settings.ALLOWED_HOSTS = ['api.paxl.example']
        settings.CSRF_TRUSTED_ORIGINS = ['https://paxl.example']
        settings.REVALIDATE_SECRET = 'long-random'
        settings.ADMIN_ENABLED = False

        assert check_deployment_settings(None) == []

    def test_qa102_it_warns_about_wildcards_local_origins_and_the_default_admin_path(self, settings):
        settings.SECRET_KEY = 'x' * 60
        settings.ALLOWED_HOSTS = ['*']
        settings.CSRF_TRUSTED_ORIGINS = ['http://localhost:3000']
        settings.REVALIDATE_SECRET = ''
        settings.ADMIN_ENABLED = True
        settings.ADMIN_URL_PATH = 'admin/'

        problems = check_deployment_settings(None)

        assert sorted(p.id for p in problems) == ['paxl.W001', 'paxl.W002', 'paxl.W003', 'paxl.W004']
        assert all(isinstance(p, Warning) for p in problems)

    def test_qa102_the_development_secret_key_is_an_error(self, settings):
        settings.SECRET_KEY = 'django-insecure-dev-only-change-in-production'

        assert 'paxl.E003' in [p.id for p in check_deployment_settings(None)]


class TestAdminLoginLimit:
    def view(self):
        return limit_admin_login(lambda request: HttpResponse('login form'))

    def test_qa102_the_eleventh_attempt_in_a_minute_is_refused(self, settings):
        settings.ADMIN_LOGIN_RATE = '10/minute'
        view = self.view()
        post = RequestFactory().post('/admin/login/', REMOTE_ADDR='203.0.113.9')

        statuses = [view(post).status_code for _ in range(11)]

        assert statuses == [200] * 10 + [429]

    def test_qa102_looking_at_the_form_is_not_counted(self, settings):
        settings.ADMIN_LOGIN_RATE = '2/minute'
        view = self.view()
        get = RequestFactory().get('/admin/login/', REMOTE_ADDR='203.0.113.10')

        assert [view(get).status_code for _ in range(5)] == [200] * 5

    def test_qa102_another_address_has_its_own_budget(self, settings):
        settings.ADMIN_LOGIN_RATE = '1/minute'
        view = self.view()

        first = view(RequestFactory().post('/admin/login/', REMOTE_ADDR='203.0.113.11'))
        second = view(RequestFactory().post('/admin/login/', REMOTE_ADDR='203.0.113.12'))

        assert first.status_code == second.status_code == 200


def test_the_admin_is_off_by_default_outside_development(monkeypatch):
    import importlib
    import config.settings as settings_module

    monkeypatch.setenv('DJANGO_DEBUG', 'False')
    monkeypatch.setenv('DJANGO_SECRET_KEY', 'x' * 60)
    monkeypatch.delenv('ADMIN_ENABLED', raising=False)
    reloaded = importlib.reload(settings_module)
    try:
        assert reloaded.ADMIN_ENABLED is False
    finally:
        monkeypatch.undo()
        importlib.reload(settings_module)

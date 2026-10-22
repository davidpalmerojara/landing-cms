"""Management commands the deployment runs without a shell (A14, DEPLOY-009)."""
import io
import logging
import sys
import types
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts.guests import create_guest
from accounts.models import MagicToken
from billing.models import Plan, Subscription
from billing.permissions import get_user_plan
from pages.management.commands import daily_maintenance

User = get_user_model()

DEMO_ENV = {'DEMO_USERNAME': 'demo', 'DEMO_EMAIL': 'demo@example.com', 'DEMO_PASSWORD': 'a-long-demo-password'}


@pytest.fixture
def plans(db):
    call_command('seed_plans', stdout=io.StringIO())


@pytest.fixture
def demo_env(monkeypatch):
    for name, value in DEMO_ENV.items():
        monkeypatch.setenv(name, value)


def run(command):
    out = io.StringIO()
    call_command(command, stdout=out)
    return out.getvalue()


class TestSeedDemo:
    def test_deploy009_it_creates_a_verified_pro_account_that_can_sign_in(self, plans, demo_env):
        run('seed_demo')

        user = User.objects.get(username='demo')
        assert user.email == 'demo@example.com'
        assert user.email_verified
        assert user.check_password('a-long-demo-password')
        subscription = Subscription.objects.get(workspace__owner=user)
        assert (subscription.plan.name, subscription.status) == ('pro', 'active')
        assert get_user_plan(user).name == 'pro'

    def test_deploy009_running_it_twice_changes_nothing(self, plans, demo_env):
        run('seed_demo')
        first = User.objects.get(username='demo')
        password_hash = first.password

        output = run('seed_demo')

        assert 'up to date' in output
        assert User.objects.filter(username='demo').count() == 1
        assert User.objects.get(username='demo').password == password_hash
        assert Subscription.objects.filter(workspace__owner=first).count() == 1

    def test_deploy009_it_repairs_an_account_registered_by_hand(self, plans, demo_env):
        """The runbook's old path: register `demo` in the UI, then make it Pro."""
        user = User.objects.create_user(username='Demo', email='someone@example.com', password='other-password-1')

        run('seed_demo')

        user.refresh_from_db()
        assert user.email == 'demo@example.com'
        assert user.email_verified
        assert user.check_password('a-long-demo-password')
        assert get_user_plan(user).name == 'pro'

    def test_deploy009_it_does_nothing_without_the_variables(self, plans, monkeypatch):
        monkeypatch.delenv('DEMO_PASSWORD', raising=False)
        monkeypatch.setenv('DEMO_USERNAME', 'demo')
        monkeypatch.setenv('DEMO_EMAIL', 'demo@example.com')

        output = run('seed_demo')

        assert 'skipped' in output
        assert not User.objects.filter(username='demo').exists()

    def test_deploy009_it_asks_for_the_plans_first(self, db, demo_env):
        with pytest.raises(CommandError, match='seed_plans'):
            run('seed_demo')

    def test_deploy009_it_never_takes_over_another_accounts_email(self, plans, demo_env):
        User.objects.create_user(username='other', email='demo@example.com', password='other-password-1')

        with pytest.raises(CommandError, match='another account'):
            run('seed_demo')


@pytest.mark.django_db
class TestDailyMaintenance:
    @pytest.fixture(autouse=True)
    def no_analytics_module(self, monkeypatch):
        monkeypatch.setitem(sys.modules, 'analytics.retention', None)  # import fails until the real one exists

    def test_a14_it_removes_expired_guests_and_old_magic_tokens(self, plans):
        guest = create_guest()
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(hours=48))
        token = MagicToken.objects.create(email='a@example.com', token='t' * 40)
        MagicToken.objects.filter(pk=token.pk).update(created_at=timezone.now() - timedelta(days=3))

        output = run('daily_maintenance')

        assert not User.objects.filter(pk=guest.pk).exists()
        assert not MagicToken.objects.filter(pk=token.pk).exists()
        assert 'Daily maintenance finished' in output

    def test_a14_it_keeps_live_guests(self, plans):
        guest = create_guest()

        run('daily_maintenance')

        assert User.objects.filter(pk=guest.pk).exists()

    def test_a14_a_missing_analytics_prune_is_reported_not_fatal(self, caplog):
        with caplog.at_level(logging.WARNING):
            output = run('daily_maintenance')

        assert 'skipped' in output
        assert 'Analytics retention is not available' in caplog.text

    def test_a14_it_calls_the_analytics_prune_when_it_exists(self, monkeypatch):
        module = types.ModuleType('analytics.retention')
        module.prune_old_events = lambda: 7
        monkeypatch.setitem(sys.modules, 'analytics.retention', module)

        assert 'Pruned 7 old analytics events' in run('daily_maintenance')

    def test_a14_a_failing_step_does_not_stop_the_rest_but_fails_the_run(self, monkeypatch, plans):
        guest = create_guest()
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(hours=48))
        module = types.ModuleType('analytics.retention')

        def broken():
            raise RuntimeError('database went away')

        module.prune_old_events = broken
        monkeypatch.setitem(sys.modules, 'analytics.retention', module)

        with pytest.raises(CommandError, match='analytics'):
            run('daily_maintenance')

        assert not User.objects.filter(pk=guest.pk).exists()

    def test_a14_the_command_skips_system_checks(self):
        """CI runs it with a placeholder secret key and no proxy count."""
        assert daily_maintenance.Command.requires_system_checks == []

"""Management commands the deployment runs without a shell (A14, DEPLOY-009)."""
import io
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts.guests import create_guest
from accounts.models import MagicToken, SentEmail
from analytics.models import AnalyticsEvent
from billing.models import Plan, Subscription
from billing.permissions import get_user_plan
from pages.management.commands import daily_maintenance
from tests.factories import PageFactory

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


def old_event(page, days):
    event = AnalyticsEvent.objects.create(page=page, visitor_id='v' * 16, event_type='pageview')
    AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=timezone.now() - timedelta(days=days))
    return event


@pytest.mark.django_db
class TestDailyMaintenance:
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

    def test_a14_it_prunes_analytics_past_the_retention_and_keeps_recent_events(self, user):
        page = PageFactory(owner=user)
        old = old_event(page, days=120)
        recent = old_event(page, days=3)

        output = run('daily_maintenance')

        assert not AnalyticsEvent.objects.filter(pk=old.pk).exists()
        assert AnalyticsEvent.objects.filter(pk=recent.pk).exists()
        assert 'Pruned 1 old analytics events' in output

    def test_a14_it_prunes_the_sent_email_records_that_the_daily_caps_no_longer_need(self):
        old = SentEmail.objects.create(kind=SentEmail.Kind.MAGIC_LINK, recipient_hash='a' * 64)
        SentEmail.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=60))
        recent = SentEmail.objects.create(kind=SentEmail.Kind.MAGIC_LINK, recipient_hash='b' * 64)

        run('daily_maintenance')

        assert not SentEmail.objects.filter(pk=old.pk).exists()
        assert SentEmail.objects.filter(pk=recent.pk).exists()

    def test_a14_a_failing_step_does_not_stop_the_rest_but_fails_the_run(self, monkeypatch, plans):
        guest = create_guest()
        User.objects.filter(pk=guest.pk).update(created_at=timezone.now() - timedelta(hours=48))

        def broken():
            raise RuntimeError('database went away')

        monkeypatch.setattr(daily_maintenance, 'prune_old_events', broken)

        with pytest.raises(CommandError, match='analytics'):
            run('daily_maintenance')

        assert not User.objects.filter(pk=guest.pk).exists()

    def test_a14_the_command_skips_system_checks(self):
        """CI runs it with a placeholder secret key, the console email backend and no proxy count."""
        assert daily_maintenance.Command.requires_system_checks == []

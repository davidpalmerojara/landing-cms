"""C1 (ADR-050): while payments are off every account and guest has the Pro features.

UX-005: a registered account fell to Free right after a guest trial that had
everything: no collaboration, no analytics, the watermark, 3 pages.
"""
from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from billing.models import Plan, Subscription
from billing.permissions import check_page_limit, get_user_plan
from pages.models import Workspace
from tests.factories import BlockFactory, PageFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def plans():
    Plan.objects.create(name='free', display_name='Free', max_pages=3, max_version_history=5)
    Plan.objects.create(
        name='pro', display_name='Pro', max_pages=-1, has_analytics=True, has_collaboration=True,
        remove_watermark=True, max_version_history=-1, max_ai_generations_per_hour=10,
    )


@pytest.fixture
def demo(settings):
    settings.DEMO_ALL_PRO = True
    settings.STRIPE_SECRET_KEY = ''


@pytest.fixture
def free_user():
    user = UserFactory()
    Workspace.objects.create(owner=user, name='ws')  # the signal gives it a Free subscription
    assert Subscription.objects.get(workspace__owner=user).plan.name == 'free'
    return user


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class TestDemoPlan:
    def test_c1_a_free_account_gets_the_pro_plan(self, demo, free_user):
        assert get_user_plan(free_user).name == 'pro'

    def test_c1_features_say_so(self, demo):
        data = APIClient().get('/api/features/').data
        assert data['demo_all_pro'] is True
        assert data['billing'] is False

    def test_ux_005_analytics_and_no_watermark_for_a_registered_account(self, demo, free_user):
        page = PageFactory(owner=free_user, slug='mia')
        BlockFactory(page=page, type='hero')
        page.publish(free_user)

        assert client_for(free_user).get(f'/api/pages/{page.pk}/analytics/').status_code == status.HTTP_200_OK
        assert APIClient().get('/api/public/pages/mia/').data['show_watermark'] is False

    def test_c1_the_subscription_endpoint_names_the_plan_in_effect(self, demo, free_user):
        data = client_for(free_user).get('/api/billing/subscription/').data
        assert data['subscription']['plan']['name'] == 'free'  # stored, untouched
        assert data['effective_plan']['name'] == 'pro'
        assert data['demo_all_pro'] is True

    def test_c1_pro_still_has_the_page_cap_of_the_free_database(self, demo, free_user, settings):
        settings.MAX_PAGES_PER_ACCOUNT = 2
        PageFactory(owner=free_user)
        check_page_limit(free_user)
        PageFactory(owner=free_user)
        response = client_for(free_user).post('/api/pages/', {'name': 'Otra', 'blocks': []}, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'PAGE_LIMIT'

    def test_without_plans_in_the_database_the_demo_still_gives_pro(self, demo, free_user):
        Plan.objects.filter(name='pro').delete()
        assert get_user_plan(free_user).has_collaboration is True
        assert client_for(free_user).get('/api/billing/subscription/').data['effective_plan']['name'] == 'pro'


class TestRealPlansWhenPaymentsAreOn:
    def test_c1_with_a_stripe_test_key_the_stored_plan_counts(self, settings, free_user):
        settings.DEMO_ALL_PRO = True
        settings.STRIPE_SECRET_KEY = 'sk_test_123'
        assert get_user_plan(free_user).name == 'free'
        assert APIClient().get('/api/features/').data['demo_all_pro'] is False

    def test_the_flag_can_be_turned_off(self, settings, free_user):
        settings.DEMO_ALL_PRO = False
        assert get_user_plan(free_user).name == 'free'

    def test_the_default_is_on(self):
        import config.settings as project_settings
        assert project_settings.DEMO_ALL_PRO is True


def test_the_feature_flags_endpoint_also_says_whether_email_works(settings):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'
    assert APIClient().get('/api/features/').data['email'] is False
    with patch.object(settings, 'EMAIL_BACKEND', 'accounts.brevo.BrevoEmailBackend'):
        assert APIClient().get('/api/features/').data['email'] is True

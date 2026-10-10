"""Billing is a feature behind a Stripe TEST key (D2, QA-018) and its webhooks are idempotent."""
import logging
from unittest.mock import MagicMock, patch

import pytest
import stripe
from django.core.checks import Error
from rest_framework import status
from rest_framework.test import APIClient

from billing.models import PaymentHistory, Subscription, WebhookLog
from billing.tests.test_billing_views import seed_billing
from config.checks import check_stripe_key_is_not_live
from config.features import billing_enabled

pytestmark = pytest.mark.django_db

WEBHOOK_URL = '/api/billing/webhook/'


@pytest.fixture(autouse=True)
def billing_off(settings):
    settings.STRIPE_SECRET_KEY = ''
    settings.STRIPE_WEBHOOK_SECRET = 'whsec_unit'


class TestWithoutStripeKeys:
    def test_qa018_features_says_billing_is_off(self):
        resp = APIClient().get('/api/features/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()['billing'] is False

    @pytest.mark.parametrize('url', ['/api/billing/checkout/', '/api/billing/portal/'])
    def test_qa018_checkout_and_portal_answer_503_feature_disabled(self, auth_client, user, url):
        seed_billing(user)

        resp = auth_client.post(url, {'cycle': 'monthly'}, format='json')

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert resp.json()['code'] == 'FEATURE_DISABLED'
        assert 'STRIPE' not in resp.json()['error']

    def test_qa018_the_webhook_answers_503_too(self, api_client):
        resp = api_client.post(WEBHOOK_URL, '{}', content_type='application/json')

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert resp.json()['code'] == 'FEATURE_DISABLED'

    def test_plans_and_subscription_still_work_so_the_limits_stay_visible(self, auth_client, user):
        seed_billing(user)

        assert auth_client.get('/api/billing/plans/').status_code == status.HTTP_200_OK
        assert auth_client.get('/api/billing/subscription/').status_code == status.HTTP_200_OK


class TestTestKey:
    @pytest.fixture(autouse=True)
    def test_key(self, settings):
        settings.STRIPE_SECRET_KEY = 'sk_test_unit'

    def test_features_says_billing_is_on(self, api_client):
        assert api_client.get('/api/features/').json()['billing'] is True

    @patch('stripe.Customer.create', side_effect=stripe.APIConnectionError('no network'))
    def test_qa018_a_stripe_failure_is_a_502_without_stripes_text(self, _create, auth_client, user):
        seed_billing(user)

        resp = auth_client.post('/api/billing/checkout/', {'cycle': 'monthly'}, format='json')

        assert resp.status_code == status.HTTP_502_BAD_GATEWAY
        assert resp.json()['code'] == 'BILLING_PROVIDER_ERROR'
        assert 'no network' not in resp.json()['error']

    def test_qa018_a_missing_price_is_a_503_not_a_500(self, auth_client, user, settings):
        _, _, _, pro = seed_billing(user)
        pro.stripe_price_id_monthly = ''
        pro.save()
        settings.STRIPE_PRO_PRICE_MONTHLY = ''

        resp = auth_client.post('/api/billing/checkout/', {'cycle': 'monthly'}, format='json')

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert resp.json()['code'] == 'BILLING_NOT_CONFIGURED'


class TestLiveKeysAreRefused:
    def test_d2_a_live_key_keeps_billing_off_and_logs_an_error(self, settings, caplog):
        settings.STRIPE_SECRET_KEY = 'sk_live_not_for_the_demo'

        with caplog.at_level(logging.ERROR, logger='config.features'):
            enabled = billing_enabled()

        assert enabled is False
        assert 'live key' in caplog.text

    def test_d2_checkout_is_503_with_a_live_key(self, auth_client, user, settings):
        settings.STRIPE_SECRET_KEY = 'rk_live_restricted'
        seed_billing(user)

        resp = auth_client.post('/api/billing/checkout/', {'cycle': 'monthly'}, format='json')

        assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_d2_the_system_check_stops_a_deploy_with_a_live_key(self, settings):
        settings.STRIPE_SECRET_KEY = 'sk_live_not_for_the_demo'

        problems = check_stripe_key_is_not_live(None)

        assert [p.id for p in problems] == ['paxl.E002']
        assert isinstance(problems[0], Error)

    @pytest.mark.parametrize('key', ['', 'sk_test_abc', 'rk_test_abc'])
    def test_d2_test_keys_and_no_key_pass_the_check(self, settings, key):
        settings.STRIPE_SECRET_KEY = key

        assert check_stripe_key_is_not_live(None) == []


class TestIdempotentWebhooks:
    @pytest.fixture(autouse=True)
    def test_key(self, settings):
        settings.STRIPE_SECRET_KEY = 'sk_test_unit'

    def send(self, client, event):
        with patch('stripe.Webhook.construct_event', return_value=event):
            return client.post(
                WEBHOOK_URL, '{"id":"%s"}' % event['id'],
                content_type='application/json', HTTP_STRIPE_SIGNATURE='t=1,v1=x',
            )

    def invoice_paid(self, event_id='evt_paid_1', invoice_id='in_1'):
        return {
            'id': event_id,
            'type': 'invoice.paid',
            'data': {'object': {
                'id': invoice_id, 'customer': 'cus_1', 'subscription': 'sub_1',
                'amount_paid': 1900, 'currency': 'eur', 'payment_intent': 'pi_1',
                'hosted_invoice_url': 'https://stripe.test/in_1',
            }},
        }

    @pytest.fixture
    def subscription(self, user):
        _, subscription, _, _ = seed_billing(user)
        subscription.stripe_customer_id = 'cus_1'
        subscription.stripe_subscription_id = 'sub_1'
        subscription.save()
        return subscription

    def test_a_duplicate_event_records_one_payment(self, api_client, subscription):
        event = self.invoice_paid()

        assert self.send(api_client, event).status_code == status.HTTP_200_OK
        assert self.send(api_client, event).status_code == status.HTTP_200_OK

        assert PaymentHistory.objects.filter(subscription=subscription).count() == 1
        assert WebhookLog.objects.filter(stripe_event_id='evt_paid_1', processed=True).count() == 1

    def test_two_events_for_the_same_invoice_keep_one_payment_row(self, api_client, subscription):
        self.send(api_client, self.invoice_paid('evt_a', 'in_same'))
        self.send(api_client, self.invoice_paid('evt_b', 'in_same'))

        assert PaymentHistory.objects.filter(subscription=subscription, stripe_invoice_id='in_same').count() == 1

    def test_a_failed_invoice_paid_later_updates_its_row(self, api_client, subscription):
        failed = {
            'id': 'evt_failed', 'type': 'invoice.payment_failed',
            'data': {'object': {'id': 'in_retry', 'customer': 'cus_1', 'subscription': 'sub_1', 'amount_due': 1900}},
        }
        self.send(api_client, failed)
        self.send(api_client, self.invoice_paid('evt_paid_later', 'in_retry'))

        payment = PaymentHistory.objects.get(subscription=subscription, stripe_invoice_id='in_retry')
        assert payment.status == PaymentHistory.Status.PAID

    def test_a_handler_that_fails_is_rolled_back_and_retried_by_stripe(self, api_client, subscription):
        event = self.invoice_paid('evt_flaky')
        with patch.dict('billing.views.WEBHOOK_HANDLERS', {'invoice.paid': MagicMock(side_effect=RuntimeError('boom'))}):
            first = self.send(api_client, event)

        assert first.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert first.json()['code'] == 'WEBHOOK_FAILED'
        log = WebhookLog.objects.get(stripe_event_id='evt_flaky')
        assert log.processed is False and 'boom' in log.error

        retry = self.send(api_client, event)

        assert retry.status_code == status.HTTP_200_OK
        log.refresh_from_db()
        assert log.processed is True and log.error == ''
        assert PaymentHistory.objects.filter(subscription=subscription).count() == 1
        subscription.refresh_from_db()
        assert subscription.status == Subscription.Status.ACTIVE

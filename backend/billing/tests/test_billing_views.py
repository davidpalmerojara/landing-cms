import stripe
import pytest
from unittest.mock import patch, MagicMock

from rest_framework import status

from billing.models import Plan, Subscription, PaymentHistory, WebhookLog
from tests.factories import UserFactory, WorkspaceFactory


def get_plans() -> tuple[Plan, Plan]:
    free_plan, _ = Plan.objects.get_or_create(
        name='free',
        defaults={
            'display_name': 'Free',
            'price_monthly': 0,
            'price_yearly': 0,
            'max_pages': 3,
            'max_ai_generations_per_hour': 0,
            'has_analytics': False,
            'has_collaboration': False,
            'has_custom_domain': False,
            'has_ab_testing': False,
            'remove_watermark': False,
            'max_version_history': 5,
            'is_active': True,
        },
    )
    pro_plan, _ = Plan.objects.get_or_create(
        name='pro',
        defaults={
            'display_name': 'Pro',
            'price_monthly': 19,
            'price_yearly': 190,
            'stripe_price_id_monthly': 'price_monthly_test',
            'stripe_price_id_yearly': 'price_yearly_test',
            'max_pages': 100,
            'max_ai_generations_per_hour': 10,
            'has_analytics': True,
            'has_collaboration': True,
            'has_custom_domain': True,
            'has_ab_testing': False,
            'remove_watermark': True,
            'max_version_history': 50,
            'is_active': True,
        },
    )
    return free_plan, pro_plan


def seed_billing(user):
    free_plan, pro_plan = get_plans()
    workspace = WorkspaceFactory(owner=user)
    subscription = workspace.subscription
    subscription.plan = free_plan
    subscription.status = Subscription.Status.FREE
    subscription.save(update_fields=['plan', 'status'])
    return workspace, subscription, free_plan, pro_plan


@pytest.mark.django_db
class TestBillingViews:
    def test_get_subscription_returns_current_users_subscription(self, auth_client, user):
        _, subscription, _, _ = seed_billing(user)

        resp = auth_client.get('/api/billing/subscription/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['subscription']['id'] == str(subscription.id)
        assert resp.data['subscription']['plan']['name'] == 'free'

    def test_get_subscription_without_auth_returns_401(self, api_client):
        resp = api_client.get('/api/billing/subscription/')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_payments_returns_only_current_users_payments(self, auth_client, user):
        _, subscription, _, _ = seed_billing(user)
        PaymentHistory.objects.create(
            subscription=subscription,
            stripe_invoice_id='inv_user',
            stripe_payment_intent_id='pi_user',
            amount=19,
            currency='eur',
            status=PaymentHistory.Status.PAID,
            invoice_url='https://stripe.test/invoice-user',
        )

        other_user = UserFactory()
        _, other_sub, _, _ = seed_billing(other_user)
        PaymentHistory.objects.create(
            subscription=other_sub,
            stripe_invoice_id='inv_other',
            stripe_payment_intent_id='pi_other',
            amount=29,
            currency='eur',
            status=PaymentHistory.Status.PAID,
            invoice_url='https://stripe.test/invoice-other',
        )

        resp = auth_client.get('/api/billing/payments/')

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data['payments']) == 1
        assert resp.data['payments'][0]['invoice_url'] == 'https://stripe.test/invoice-user'

    @patch('billing.views._get_stripe', return_value=stripe)
    @patch('stripe.Customer.create')
    @patch('stripe.checkout.Session.create')
    def test_checkout_creates_session(self, mock_session, mock_customer, _mock_get_stripe, auth_client, user):
        _, subscription, _, _ = seed_billing(user)
        mock_customer.return_value = MagicMock(id='cus_test_123')
        mock_session.return_value = MagicMock(url='https://checkout.stripe.test/session')

        resp = auth_client.post('/api/billing/checkout/', {'cycle': 'monthly'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['checkout_url'] == 'https://checkout.stripe.test/session'
        subscription.refresh_from_db()
        assert subscription.stripe_customer_id == 'cus_test_123'

    def test_checkout_with_invalid_cycle_returns_400(self, auth_client, user):
        seed_billing(user)

        resp = auth_client.post('/api/billing/checkout/', {'cycle': 'weekly'}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'cycle' in resp.data['details']

    @patch('billing.views._get_stripe', return_value=stripe)
    @patch('stripe.billing_portal.Session.create')
    def test_portal_creates_session(self, mock_session, _mock_get_stripe, auth_client, user):
        _, subscription, _, _ = seed_billing(user)
        subscription.stripe_customer_id = 'cus_portal_123'
        subscription.status = Subscription.Status.ACTIVE
        subscription.save(update_fields=['stripe_customer_id', 'status'])
        mock_session.return_value = MagicMock(url='https://portal.stripe.test/session')

        resp = auth_client.post('/api/billing/portal/', {}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['portal_url'] == 'https://portal.stripe.test/session'

    @patch('billing.views._get_stripe', return_value=stripe)
    @patch('stripe.Webhook.construct_event')
    def test_webhook_with_valid_signature_processes_event(self, mock_construct_event, _mock_get_stripe, auth_client, user):
        _, subscription, _, pro_plan = seed_billing(user)
        subscription.stripe_customer_id = 'cus_valid_123'
        subscription.save(update_fields=['stripe_customer_id'])

        event = {
            'id': 'evt_valid_123',
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'customer': 'cus_valid_123',
                    'subscription': 'sub_valid_123',
                    'metadata': {'cycle': 'monthly'},
                }
            },
        }
        mock_construct_event.return_value = event

        resp = auth_client.post(
            '/api/billing/webhook/',
            '{"id":"evt_valid_123"}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='t=123,v1=valid',
        )

        assert resp.status_code == status.HTTP_200_OK
        subscription.refresh_from_db()
        assert subscription.plan == pro_plan
        assert subscription.status == Subscription.Status.ACTIVE
        assert WebhookLog.objects.filter(stripe_event_id='evt_valid_123', processed=True).exists()

    @patch('billing.views._get_stripe', return_value=stripe)
    @patch('stripe.Webhook.construct_event')
    def test_webhook_with_invalid_signature_returns_400(self, mock_construct_event, _mock_get_stripe, auth_client, user):
        seed_billing(user)
        mock_construct_event.side_effect = stripe.error.SignatureVerificationError('bad signature', 'sig_header')

        resp = auth_client.post(
            '/api/billing/webhook/',
            '{"id":"evt_invalid_1"}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='t=123,v1=invalid',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @patch('billing.views._get_stripe', return_value=stripe)
    @patch('stripe.Webhook.construct_event')
    def test_webhook_is_idempotent_for_duplicate_events(self, mock_construct_event, _mock_get_stripe, auth_client, user):
        _, subscription, _, _ = seed_billing(user)
        subscription.stripe_customer_id = 'cus_duplicate_1'
        subscription.save(update_fields=['stripe_customer_id'])
        event = {
            'id': 'evt_duplicate_1',
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'customer': 'cus_duplicate_1',
                    'subscription': 'sub_duplicate_1',
                    'metadata': {'cycle': 'monthly'},
                }
            },
        }
        mock_construct_event.return_value = event
        mock_handler = MagicMock()

        payload = '{"id":"evt_duplicate_1"}'
        from unittest.mock import patch as mock_patch

        with mock_patch.dict('billing.views.WEBHOOK_HANDLERS', {'checkout.session.completed': mock_handler}, clear=False):
            first = auth_client.post(
                '/api/billing/webhook/',
                payload,
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=123,v1=valid',
            )
            second = auth_client.post(
                '/api/billing/webhook/',
                payload,
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=123,v1=valid',
            )

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_200_OK
        assert mock_handler.call_count == 1
        assert WebhookLog.objects.filter(stripe_event_id='evt_duplicate_1').count() == 1

"""
Stripe billing views: plans listing, checkout session, billing portal, webhook handler.

Webhook flow:
  1. Stripe sends POST to /api/billing/webhook/
  2. We verify signature with STRIPE_WEBHOOK_SECRET
  3. Log the event in WebhookLog for idempotency
  4. Dispatch to handler by event type
  5. Update Subscription / PaymentHistory accordingly
"""

import logging
from datetime import datetime, timezone as tz
from decimal import Decimal

import stripe
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.parsers import BaseParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Plan, Subscription, PaymentHistory, WebhookLog
from .permissions import get_user_subscription, invalidate_plan_cache
from .serializers import (
    PlanSerializer,
    SubscriptionSerializer,
    PaymentHistorySerializer,
    CreateCheckoutSerializer,
)

logger = logging.getLogger(__name__)


class RawBodyParser(BaseParser):
    """Parser that returns the raw request body (for Stripe webhook signature verification)."""
    media_type = 'application/json'

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


def _get_stripe():
    """Configure and return stripe module. Raises if key not set."""
    if not settings.STRIPE_SECRET_KEY:
        raise ValueError('STRIPE_SECRET_KEY not configured')
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class PlansView(APIView):
    """GET /api/billing/plans/ — list active plans (public)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        plans = Plan.objects.filter(is_active=True)
        return Response(PlanSerializer(plans, many=True).data)


class SubscriptionView(APIView):
    """GET /api/billing/subscription/ — current user's subscription."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub = get_user_subscription(request.user)
        if not sub:
            return Response({'subscription': None})
        return Response({
            'subscription': SubscriptionSerializer(sub).data,
        })


class PaymentHistoryView(APIView):
    """GET /api/billing/payments/ — user's payment history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub = get_user_subscription(request.user)
        if not sub:
            return Response({'payments': []})
        # Keep the history bounded here: the dashboard only needs a recent,
        # user-facing slice and we avoid loading an unbounded payment ledger.
        payments = sub.payments.all()[:20]
        return Response({
            'payments': PaymentHistorySerializer(payments, many=True).data,
        })


class CreateCheckoutView(APIView):
    """
    POST /api/billing/checkout/
    Body: { "cycle": "monthly" | "yearly" }

    Creates a Stripe Checkout Session for upgrading to Pro.
    Returns { "checkout_url": "https://checkout.stripe.com/..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        input_serializer = CreateCheckoutSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        cycle = input_serializer.validated_data['cycle']

        try:
            s = _get_stripe()
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Determine price ID
        pro_plan = Plan.objects.filter(name='pro', is_active=True).first()
        if not pro_plan:
            return Response(
                {'error': 'Pro plan not found.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if cycle == 'yearly':
            price_id = pro_plan.stripe_price_id_yearly or settings.STRIPE_PRO_PRICE_YEARLY
        else:
            price_id = pro_plan.stripe_price_id_monthly or settings.STRIPE_PRO_PRICE_MONTHLY

        if not price_id:
            return Response(
                {'error': f'Stripe price ID for {cycle} not configured.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Get or create Workspace + Subscription for this user
        sub = get_user_subscription(request.user)
        if not sub:
            from pages.models import Workspace
            workspace, _ = Workspace.objects.get_or_create(
                owner=request.user,
                defaults={'name': f'{request.user.username}\'s workspace'},
            )
            # The post_save signal on Workspace creates a Free Subscription,
            # but if it didn't exist yet, create it now.
            free_plan = Plan.objects.filter(name='free', is_active=True).first()
            sub, _ = Subscription.objects.get_or_create(
                workspace=workspace,
                defaults={'plan': free_plan or pro_plan, 'status': Subscription.Status.FREE},
            )

        # Get or create Stripe customer
        customer_id = sub.stripe_customer_id

        if not customer_id:
            customer = s.Customer.create(
                email=request.user.email,
                metadata={'user_id': str(request.user.pk)},
            )
            customer_id = customer.id
            sub.stripe_customer_id = customer_id
            sub.save(update_fields=['stripe_customer_id'])

        # Create checkout session
        frontend_url = settings.FRONTEND_URL.rstrip('/')
        session = s.checkout.Session.create(
            customer=customer_id,
            mode='subscription',
            line_items=[{'price': price_id, 'quantity': 1}],
            success_url=f'{frontend_url}/dashboard?billing=success',
            cancel_url=f'{frontend_url}/dashboard?billing=cancel',
            metadata={
                'user_id': str(request.user.pk),
                'cycle': cycle,
            },
            subscription_data={
                'metadata': {
                    'user_id': str(request.user.pk),
                },
            },
        )

        return Response({'checkout_url': session.url})


class CreatePortalView(APIView):
    """
    POST /api/billing/portal/

    Creates a Stripe Billing Portal session for managing subscription.
    Returns { "portal_url": "https://billing.stripe.com/..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            s = _get_stripe()
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        sub = get_user_subscription(request.user)
        if not sub or not sub.stripe_customer_id:
            return Response(
                {'error': 'No tienes una suscripción activa con Stripe.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend_url = settings.FRONTEND_URL.rstrip('/')
        session = s.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f'{frontend_url}/dashboard',
        )

        return Response({'portal_url': session.url})


@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    """
    POST /api/billing/webhook/

    Receives Stripe webhook events. Verifies signature, logs event,
    and dispatches to appropriate handler.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [RawBodyParser]

    def post(self, request):
        try:
            s = _get_stripe()
        except ValueError:
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        payload = request.data  # raw bytes from RawBodyParser
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

        if not settings.STRIPE_WEBHOOK_SECRET:
            logger.error('STRIPE_WEBHOOK_SECRET not configured')
            return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Verify signature
        try:
            event = s.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET,
            )
        except ValueError:
            logger.warning('Invalid Stripe webhook payload')
            return Response(status=status.HTTP_400_BAD_REQUEST)
        except s.error.SignatureVerificationError:
            logger.warning('Invalid Stripe webhook signature')
            return Response(status=status.HTTP_400_BAD_REQUEST)

        # Idempotency: check if we already processed this event
        event_id = event['id']
        event_type = event['type']

        webhook_log, created = WebhookLog.objects.get_or_create(
            stripe_event_id=event_id,
            defaults={
                'event_type': event_type,
                'payload': event['data'],
            },
        )
        if not created and webhook_log.processed:
            return Response(status=status.HTTP_200_OK)

        # Dispatch
        try:
            handler = WEBHOOK_HANDLERS.get(event_type)
            if handler:
                handler(event)
            else:
                logger.info('Unhandled Stripe event: %s', event_type)

            webhook_log.processed = True
            webhook_log.save(update_fields=['processed'])
        except Exception as e:
            logger.exception('Error processing Stripe webhook %s: %s', event_type, e)
            webhook_log.error = str(e)
            webhook_log.save(update_fields=['error'])

        return Response(status=status.HTTP_200_OK)


# ── Webhook handlers ──────────────────────────────────


def _find_subscription_by_customer(customer_id: str) -> Subscription | None:
    return Subscription.objects.filter(stripe_customer_id=customer_id).first()


def _find_subscription_by_stripe_sub(stripe_sub_id: str) -> Subscription | None:
    return Subscription.objects.filter(stripe_subscription_id=stripe_sub_id).first()


def _ts_to_dt(ts):
    """Convert Stripe timestamp to datetime."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=tz.utc)


def handle_checkout_completed(event):
    """
    checkout.session.completed — user completed the checkout flow.
    Link Stripe subscription to our Subscription model.
    """
    session = event['data']['object']
    customer_id = session.get('customer')
    stripe_sub_id = session.get('subscription')
    metadata = session.get('metadata', {})
    cycle = metadata.get('cycle', 'monthly')

    if not customer_id or not stripe_sub_id:
        logger.warning('checkout.session.completed missing customer/subscription')
        return

    sub = _find_subscription_by_customer(customer_id)
    if not sub:
        logger.warning('No Subscription found for customer %s', customer_id)
        return

    pro_plan = Plan.objects.filter(name='pro', is_active=True).first()
    if not pro_plan:
        logger.error('Pro plan not found in DB')
        return

    sub.plan = pro_plan
    sub.stripe_subscription_id = stripe_sub_id
    sub.status = Subscription.Status.ACTIVE
    sub.billing_cycle = cycle
    sub.save(update_fields=[
        'plan', 'stripe_subscription_id', 'status', 'billing_cycle', 'updated_at',
    ])

    # Invalidate plan cache for the workspace owner
    if sub.workspace and sub.workspace.owner:
        invalidate_plan_cache(sub.workspace.owner)

    logger.info('Subscription activated: workspace=%s plan=pro cycle=%s', sub.workspace_id, cycle)


def handle_invoice_paid(event):
    """
    invoice.paid — record successful payment, update subscription period.
    """
    invoice = event['data']['object']
    customer_id = invoice.get('customer')
    stripe_sub_id = invoice.get('subscription')

    sub = (
        _find_subscription_by_stripe_sub(stripe_sub_id)
        if stripe_sub_id
        else _find_subscription_by_customer(customer_id)
    )
    if not sub:
        logger.warning('invoice.paid: no subscription found for %s', customer_id)
        return

    # Update period dates
    lines = invoice.get('lines', {}).get('data', [])
    if lines:
        line = lines[0].get('period', {})
        sub.current_period_start = _ts_to_dt(line.get('start'))
        sub.current_period_end = _ts_to_dt(line.get('end'))

    sub.status = Subscription.Status.ACTIVE
    sub.save(update_fields=['status', 'current_period_start', 'current_period_end', 'updated_at'])

    # Record payment
    amount_paid = Decimal(str(invoice.get('amount_paid', 0))) / 100
    PaymentHistory.objects.create(
        subscription=sub,
        stripe_invoice_id=invoice.get('id', ''),
        stripe_payment_intent_id=invoice.get('payment_intent') or '',
        amount=amount_paid,
        currency=invoice.get('currency', 'eur'),
        status=PaymentHistory.Status.PAID,
        invoice_url=invoice.get('hosted_invoice_url') or '',
    )

    if sub.workspace and sub.workspace.owner:
        invalidate_plan_cache(sub.workspace.owner)

    logger.info('Payment recorded: sub=%s amount=%s', sub.pk, amount_paid)


def handle_invoice_payment_failed(event):
    """
    invoice.payment_failed — mark subscription as past_due.
    """
    invoice = event['data']['object']
    stripe_sub_id = invoice.get('subscription')
    customer_id = invoice.get('customer')

    sub = (
        _find_subscription_by_stripe_sub(stripe_sub_id)
        if stripe_sub_id
        else _find_subscription_by_customer(customer_id)
    )
    if not sub:
        return

    sub.status = Subscription.Status.PAST_DUE
    sub.save(update_fields=['status', 'updated_at'])

    # Record failed payment
    amount = Decimal(str(invoice.get('amount_due', 0))) / 100
    PaymentHistory.objects.create(
        subscription=sub,
        stripe_invoice_id=invoice.get('id', ''),
        stripe_payment_intent_id=invoice.get('payment_intent') or '',
        amount=amount,
        currency=invoice.get('currency', 'eur'),
        status=PaymentHistory.Status.FAILED,
        invoice_url=invoice.get('hosted_invoice_url') or '',
    )

    if sub.workspace and sub.workspace.owner:
        invalidate_plan_cache(sub.workspace.owner)

    logger.warning('Payment failed: sub=%s', sub.pk)


def handle_subscription_updated(event):
    """
    customer.subscription.updated — sync status changes (cancel, resume, etc).
    """
    stripe_sub = event['data']['object']
    stripe_sub_id = stripe_sub.get('id')

    sub = _find_subscription_by_stripe_sub(stripe_sub_id)
    if not sub:
        return

    # Map Stripe status to our status
    stripe_status = stripe_sub.get('status')
    status_map = {
        'active': Subscription.Status.ACTIVE,
        'trialing': Subscription.Status.TRIALING,
        'past_due': Subscription.Status.PAST_DUE,
        'canceled': Subscription.Status.CANCELED,
        'unpaid': Subscription.Status.UNPAID,
    }
    new_status = status_map.get(stripe_status)
    if new_status:
        sub.status = new_status

    sub.cancel_at_period_end = stripe_sub.get('cancel_at_period_end', False)
    sub.current_period_start = _ts_to_dt(stripe_sub.get('current_period_start'))
    sub.current_period_end = _ts_to_dt(stripe_sub.get('current_period_end'))
    sub.trial_end = _ts_to_dt(stripe_sub.get('trial_end'))

    sub.save(update_fields=[
        'status', 'cancel_at_period_end',
        'current_period_start', 'current_period_end',
        'trial_end', 'updated_at',
    ])

    if sub.workspace and sub.workspace.owner:
        invalidate_plan_cache(sub.workspace.owner)

    logger.info('Subscription updated: sub=%s status=%s', sub.pk, new_status)


def handle_subscription_deleted(event):
    """
    customer.subscription.deleted — downgrade to Free plan.
    """
    stripe_sub = event['data']['object']
    stripe_sub_id = stripe_sub.get('id')

    sub = _find_subscription_by_stripe_sub(stripe_sub_id)
    if not sub:
        return

    free_plan = Plan.objects.filter(name='free', is_active=True).first()
    if free_plan:
        sub.plan = free_plan

    sub.status = Subscription.Status.CANCELED
    sub.stripe_subscription_id = None
    sub.cancel_at_period_end = False
    sub.save(update_fields=[
        'plan', 'status', 'stripe_subscription_id',
        'cancel_at_period_end', 'updated_at',
    ])

    if sub.workspace and sub.workspace.owner:
        invalidate_plan_cache(sub.workspace.owner)

    logger.info('Subscription canceled → Free: sub=%s', sub.pk)


WEBHOOK_HANDLERS = {
    'checkout.session.completed': handle_checkout_completed,
    'invoice.paid': handle_invoice_paid,
    'invoice.payment_failed': handle_invoice_payment_failed,
    'customer.subscription.updated': handle_subscription_updated,
    'customer.subscription.deleted': handle_subscription_deleted,
}

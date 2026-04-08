import uuid

from django.conf import settings
from django.db import models


class Plan(models.Model):
    """
    Defines a billing plan with feature limits.

    The Free plan has stripe_price_id = null.
    Limits of -1 mean unlimited.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)  # "free", "pro"
    display_name = models.CharField(max_length=100)  # "Free", "Pro"
    stripe_price_id_monthly = models.CharField(max_length=200, null=True, blank=True)
    stripe_price_id_yearly = models.CharField(max_length=200, null=True, blank=True)
    price_monthly = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    price_yearly = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # Feature limits
    max_pages = models.IntegerField(default=3)  # -1 = unlimited
    max_ai_generations_per_hour = models.IntegerField(default=0)
    has_analytics = models.BooleanField(default=False)
    has_collaboration = models.BooleanField(default=False)
    has_custom_domain = models.BooleanField(default=False)
    has_ab_testing = models.BooleanField(default=False)
    remove_watermark = models.BooleanField(default=False)
    max_version_history = models.IntegerField(default=5)  # -1 = unlimited

    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['price_monthly']

    def __str__(self):
        return self.display_name


class Subscription(models.Model):
    """
    Links a Workspace to a Plan with Stripe subscription state.

    Every Workspace gets a Subscription on creation (initially Free).
    """

    class Status(models.TextChoices):
        FREE = 'free', 'Free'
        TRIALING = 'trialing', 'Trialing'
        ACTIVE = 'active', 'Active'
        PAST_DUE = 'past_due', 'Past Due'
        CANCELED = 'canceled', 'Canceled'
        UNPAID = 'unpaid', 'Unpaid'

    class BillingCycle(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        YEARLY = 'yearly', 'Yearly'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        'pages.Workspace',
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    stripe_customer_id = models.CharField(max_length=200, null=True, blank=True, db_index=True)
    stripe_subscription_id = models.CharField(max_length=200, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FREE)
    billing_cycle = models.CharField(
        max_length=10,
        choices=BillingCycle.choices,
        null=True,
        blank=True,
    )
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    trial_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.workspace} — {self.plan.display_name} ({self.status})'

    @property
    def is_paid(self) -> bool:
        """True if subscription grants paid features (active, trialing)."""
        return self.status in (self.Status.ACTIVE, self.Status.TRIALING)


class PaymentHistory(models.Model):
    """Records each invoice/payment from Stripe for audit and display."""

    class Status(models.TextChoices):
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        REFUNDED = 'refunded', 'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    stripe_invoice_id = models.CharField(max_length=200, db_index=True)
    stripe_payment_intent_id = models.CharField(max_length=200, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='eur')
    status = models.CharField(max_length=20, choices=Status.choices)
    invoice_url = models.URLField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.amount} {self.currency} — {self.status}'


class WebhookLog(models.Model):
    """Logs every Stripe webhook event for debugging and idempotency."""

    stripe_event_id = models.CharField(max_length=200, unique=True)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    processed = models.BooleanField(default=False)
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.event_type} ({self.stripe_event_id})'

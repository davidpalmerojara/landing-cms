from rest_framework import serializers

from .models import Plan, Subscription, PaymentHistory


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            'id', 'name', 'display_name',
            'price_monthly', 'price_yearly',
            'max_pages', 'max_ai_generations_per_hour',
            'has_analytics', 'has_collaboration',
            'has_custom_domain', 'has_ab_testing',
            'remove_watermark', 'max_version_history',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            'id', 'plan', 'status', 'billing_cycle',
            'current_period_start', 'current_period_end',
            'cancel_at_period_end', 'trial_end',
            'created_at',
        ]


class PaymentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentHistory
        fields = [
            'id', 'amount', 'currency', 'status',
            'invoice_url', 'created_at',
        ]


class CreateCheckoutSerializer(serializers.Serializer):
    cycle = serializers.ChoiceField(
        choices=(
            ('monthly', 'monthly'),
            ('yearly', 'yearly'),
        ),
        required=False,
        default='monthly',
    )

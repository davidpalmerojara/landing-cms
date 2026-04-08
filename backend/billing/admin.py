from django.contrib import admin

from .models import Plan, Subscription, PaymentHistory, WebhookLog


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'name', 'price_monthly', 'price_yearly', 'max_pages', 'is_active')
    list_filter = ('is_active',)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'plan', 'status', 'billing_cycle', 'current_period_end', 'cancel_at_period_end')
    list_filter = ('status', 'plan')
    search_fields = ('workspace__name', 'stripe_customer_id', 'stripe_subscription_id')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(PaymentHistory)
class PaymentHistoryAdmin(admin.ModelAdmin):
    list_display = ('subscription', 'amount', 'currency', 'status', 'created_at')
    list_filter = ('status', 'currency')
    readonly_fields = ('id', 'created_at')


@admin.register(WebhookLog)
class WebhookLogAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'stripe_event_id', 'processed', 'created_at')
    list_filter = ('event_type', 'processed')
    readonly_fields = ('created_at',)

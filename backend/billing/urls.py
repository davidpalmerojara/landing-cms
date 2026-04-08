from django.urls import path

from . import views

urlpatterns = [
    path('billing/plans/', views.PlansView.as_view(), name='billing-plans'),
    path('billing/subscription/', views.SubscriptionView.as_view(), name='billing-subscription'),
    path('billing/payments/', views.PaymentHistoryView.as_view(), name='billing-payments'),
    path('billing/checkout/', views.CreateCheckoutView.as_view(), name='billing-checkout'),
    path('billing/portal/', views.CreatePortalView.as_view(), name='billing-portal'),
    path('billing/webhook/', views.StripeWebhookView.as_view(), name='stripe-webhook'),
]

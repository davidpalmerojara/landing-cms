"""
Creates the default Free and Pro plans.

Usage: python manage.py seed_plans
"""

from django.core.management.base import BaseCommand

from billing.models import Plan


PLANS = [
    {
        'name': 'free',
        'display_name': 'Free',
        'stripe_price_id_monthly': None,
        'stripe_price_id_yearly': None,
        'price_monthly': 0,
        'price_yearly': None,
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
    {
        'name': 'pro',
        'display_name': 'Pro',
        # Set these via env vars or admin after configuring Stripe
        'stripe_price_id_monthly': None,
        'stripe_price_id_yearly': None,
        'price_monthly': 19,
        'price_yearly': 190,
        'max_pages': -1,
        'max_ai_generations_per_hour': 10,
        'has_analytics': True,
        'has_collaboration': True,
        'has_custom_domain': True,
        'has_ab_testing': True,
        'remove_watermark': True,
        'max_version_history': -1,
        'is_active': True,
    },
]


class Command(BaseCommand):
    help = 'Seed default billing plans (Free, Pro)'

    def handle(self, *args, **options):
        for plan_data in PLANS:
            plan, created = Plan.objects.update_or_create(
                name=plan_data['name'],
                defaults=plan_data,
            )
            status = 'Created' if created else 'Updated'
            self.stdout.write(f'{status}: {plan.display_name} (${plan.price_monthly}/mo)')

        self.stdout.write(self.style.SUCCESS('Plans seeded successfully.'))

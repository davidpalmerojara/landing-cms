"""Create or refresh the demo account from the environment (DEPLOY-009).

Render's free plan has no shell, so the build runs this after `seed_plans`. With
DEMO_USERNAME, DEMO_EMAIL and DEMO_PASSWORD set it makes sure that account exists,
has a verified email and an active Pro subscription, and that its password is the
one in the environment. Running it again changes nothing. Without them it does
nothing, so a build without a demo account is fine.

Do it before sharing the link: page slugs are global and the first account that
publishes "Mara Vey" keeps `mara-vey`.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.functions import Lower

from billing.models import Plan, Subscription
from billing.permissions import invalidate_plan_cache
from pages.views import get_or_create_user_workspace

SETTINGS = ('DEMO_USERNAME', 'DEMO_EMAIL', 'DEMO_PASSWORD')


class Command(BaseCommand):
    help = 'Create or refresh the demo account (Pro) from DEMO_USERNAME, DEMO_EMAIL and DEMO_PASSWORD'

    def handle(self, *args, **options):
        values = {name: os.environ.get(name, '').strip() for name in SETTINGS}
        if not all(values.values()):
            self.stdout.write(f'Demo account skipped: set {", ".join(SETTINGS)} to create it.')
            return

        pro = Plan.objects.filter(name='pro', is_active=True).first()
        if pro is None:
            raise CommandError('There is no active Pro plan: run seed_plans first.')

        with transaction.atomic():
            user, created = self._ensure_user(values)
            workspace = get_or_create_user_workspace(user)
            Subscription.objects.update_or_create(
                workspace=workspace,
                defaults={'plan': pro, 'status': Subscription.Status.ACTIVE, 'cancel_at_period_end': False},
            )
        invalidate_plan_cache(user)
        self.stdout.write(self.style.SUCCESS(
            f'Demo account {"created" if created else "up to date"}: {user.username} (Pro).'
        ))

    def _ensure_user(self, values):
        User = get_user_model()
        username, email, password = values['DEMO_USERNAME'], values['DEMO_EMAIL'], values['DEMO_PASSWORD']
        user = User.objects.annotate(lower_username=Lower('username')).filter(lower_username=username.lower()).first()
        if user is None:
            if User.objects.filter(email__iexact=email).exists():
                raise CommandError('DEMO_EMAIL belongs to another account.')
            user = User(username=username, email=email, email_verified=True)
            user.set_password(password)
            user.save()
            return user, True

        if user.is_guest:
            raise CommandError('DEMO_USERNAME belongs to a guest account.')
        changed = []
        if user.email != email.lower():
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                raise CommandError('DEMO_EMAIL belongs to another account.')
            user.email = email
            changed.append('email')
        if not user.email_verified:
            user.email_verified = True
            changed.append('email_verified')
        if not user.is_active:
            user.is_active = True
            changed.append('is_active')
        if not user.check_password(password):
            user.set_password(password)
            changed.append('password')
        if changed:
            user.save(update_fields=[*changed, 'updated_at'])
        return user, False

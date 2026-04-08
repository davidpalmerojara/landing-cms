"""Delete expired and used MagicTokens older than 24 hours."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from accounts.models import MagicToken


class Command(BaseCommand):
    help = 'Delete expired or used MagicTokens older than 24 hours'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=24)
        expired_cutoff = timezone.now() - timedelta(minutes=15)

        deleted, _ = MagicToken.objects.filter(
            Q(used=True) | Q(created_at__lt=expired_cutoff)
        ).filter(created_at__lt=cutoff).delete()

        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} expired/used MagicTokens.'))

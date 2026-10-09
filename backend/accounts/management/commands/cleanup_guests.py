"""Delete expired guest accounts and everything they own.

Guest creation already sweeps a batch each time, so this is for the case
where nobody starts a guest for a while (or a cron job, when there is one).
"""

from django.core.management.base import BaseCommand

from accounts.guests import cleanup_expired_guests


class Command(BaseCommand):
    help = 'Delete guest accounts older than GUEST_LIFETIME_HOURS, with their pages and uploaded files'

    def handle(self, *args, **options):
        total = 0
        while True:
            deleted = cleanup_expired_guests(limit=100)
            if not deleted:
                break
            total += deleted
        self.stdout.write(self.style.SUCCESS(f'Deleted {total} expired guests.'))

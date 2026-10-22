"""Daily housekeeping for a deployment with no scheduler of its own (A14, DEPLOY-011).

Render's free plan has no cron and no shell, so a scheduled GitHub Actions workflow
(.github/workflows/cleanup.yml) runs this against the production database:

- expired guest accounts and everything they own;
- used or stale magic-link tokens;
- expired entries of the JWT blacklist;
- analytics events past their retention (ANALYTICS_RETENTION_DAYS, 90 by default);
- the record of sent emails past its 30 days (the per-day email caps count from it).

A step that fails is logged and does not stop the others; the command exits with an
error at the end so the workflow run shows red.
"""
import logging

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from accounts.mailing import prune_sent_emails
from analytics.retention import prune_old_events

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Daily cleanup: expired guests, magic tokens, expired JWT blacklist entries, old analytics events and old sent-email records'

    # Runs against production from CI with a placeholder secret key: nothing here signs or checks settings
    requires_system_checks = []

    def handle(self, *args, **options):
        steps = [
            ('guests', lambda: call_command('cleanup_guests', stdout=self.stdout)),
            ('magic tokens', lambda: call_command('cleanup_magic_tokens', stdout=self.stdout)),
            ('expired JWT blacklist entries', lambda: call_command('flushexpiredtokens', stdout=self.stdout)),
            ('analytics', lambda: self._report('old analytics events', prune_old_events())),
            ('sent email records', lambda: self._report('old sent-email records', prune_sent_emails())),
        ]
        failed = []
        for name, step in steps:
            try:
                step()
            except Exception:
                logger.exception('Daily maintenance step failed: %s', name)
                self.stderr.write(self.style.ERROR(f'Step failed: {name}'))
                failed.append(name)
        if failed:
            raise CommandError(f'Daily maintenance finished with failed steps: {", ".join(failed)}')
        self.stdout.write(self.style.SUCCESS('Daily maintenance finished.'))

    def _report(self, what, deleted):
        self.stdout.write(f'Pruned {deleted} {what}.')

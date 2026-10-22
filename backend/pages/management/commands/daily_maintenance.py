"""Daily housekeeping for a deployment with no scheduler of its own (A14, DEPLOY-011).

Render's free plan has no cron and no shell, so a scheduled GitHub Actions workflow
(.github/workflows/cleanup.yml) runs this against the production database:

- expired guest accounts and everything they own;
- used or stale magic-link tokens;
- expired entries of the JWT blacklist;
- analytics events past their retention.

A step that fails is logged and does not stop the others; the command exits with an
error at the end so the workflow run shows red.
"""
import importlib
import logging

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)

# Provided by the analytics retention work; looked up by name so this command still
# runs (and says so) on a tree where it is missing.
ANALYTICS_PRUNE = ('analytics.retention', 'prune_old_events')


def prune_analytics():
    """Delete analytics events past their retention. Returns how many, or None when unavailable."""
    module_name, function_name = ANALYTICS_PRUNE
    try:
        module = importlib.import_module(module_name)
        prune = getattr(module, function_name)
    except (ImportError, AttributeError):
        logger.warning('Analytics retention is not available (%s.%s): old events were not pruned',
                       module_name, function_name)
        return None
    return prune()


class Command(BaseCommand):
    help = 'Daily cleanup: expired guests, magic tokens, expired JWT blacklist entries and old analytics events'

    # Runs against production from CI with a placeholder secret key: nothing here signs or checks settings
    requires_system_checks = []

    def handle(self, *args, **options):
        steps = [
            ('guests', lambda: call_command('cleanup_guests', stdout=self.stdout)),
            ('magic tokens', lambda: call_command('cleanup_magic_tokens', stdout=self.stdout)),
            ('expired JWT blacklist entries', lambda: call_command('flushexpiredtokens', stdout=self.stdout)),
            ('analytics', self._analytics_step),
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

    def _analytics_step(self):
        deleted = prune_analytics()
        if deleted is None:
            self.stdout.write(self.style.WARNING('Analytics retention is not available: skipped.'))
        else:
            self.stdout.write(f'Pruned {deleted} old analytics events.')

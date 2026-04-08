"""
Periodic DNS verification for custom domains.

Usage:
    python manage.py check_domains

Run via cron every 5 minutes:
    */5 * * * * cd /app && python manage.py check_domains

Or via Celery beat if available.

Behavior:
- Checks pending/failed domains that haven't been checked in the last 5 minutes
- Max 3 automatic attempts per hour per domain
- Re-verifies active domains once per day to detect DNS changes
- Activates domains when DNS is verified (SSL delegated to Caddy)
"""
import socket
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from pages.models import CustomDomain


class Command(BaseCommand):
    help = 'Verify DNS for pending/failed custom domains and re-check active ones daily.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be checked without making changes.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()
        five_min_ago = now - timedelta(minutes=5)
        one_hour_ago = now - timedelta(hours=1)
        one_day_ago = now - timedelta(days=1)

        # 1. Pending/failed domains not checked in the last 5 minutes
        pending = CustomDomain.objects.filter(
            Q(dns_status='pending') | Q(dns_status='failed'),
            Q(last_dns_check_at__isnull=True) | Q(last_dns_check_at__lt=five_min_ago),
        )

        # 2. Active domains not checked in the last day (detect DNS changes)
        active_recheck = CustomDomain.objects.filter(
            dns_status='verified',
            is_active=True,
        ).filter(
            Q(last_dns_check_at__isnull=True) | Q(last_dns_check_at__lt=one_day_ago),
        )

        domains_to_check = list(pending) + list(active_recheck)

        if not domains_to_check:
            self.stdout.write(self.style.SUCCESS('No domains to check.'))
            return

        self.stdout.write(f'Checking {len(domains_to_check)} domain(s)...')

        for domain_obj in domains_to_check:
            # Rate limit: max 3 checks per hour
            if domain_obj.last_dns_check_at and domain_obj.last_dns_check_at > one_hour_ago:
                recent_checks = CustomDomain.objects.filter(
                    pk=domain_obj.pk,
                    last_dns_check_at__gt=one_hour_ago,
                ).count()
                # Simple rate limit: skip if checked recently (within 20 min for 3/hour)
                if domain_obj.last_dns_check_at > now - timedelta(minutes=20):
                    self.stdout.write(f'  SKIP {domain_obj.domain} (rate limited)')
                    continue

            if dry_run:
                self.stdout.write(f'  [DRY RUN] Would check {domain_obj.domain}')
                continue

            self._verify_domain(domain_obj, now)

    def _verify_domain(self, domain_obj, now):
        """Verify DNS for a single domain."""
        domain_obj.last_dns_check_at = now
        was_active = domain_obj.is_active

        try:
            # Try dnspython first for CNAME verification
            verified = False
            try:
                import dns.resolver
                cname_target = 'domains.builderpro.com'
                answers = dns.resolver.resolve(domain_obj.domain, 'CNAME')
                for rdata in answers:
                    if str(rdata.target).rstrip('.') == cname_target:
                        verified = True
                        break
            except ImportError:
                pass  # dnspython not installed, fall back
            except Exception:
                pass

            # Fallback: check if domain resolves at all via A record
            if not verified:
                try:
                    ip = socket.gethostbyname(domain_obj.domain)
                    if ip:
                        verified = True
                except socket.gaierror:
                    pass

            if verified:
                domain_obj.dns_status = 'verified'
                domain_obj.dns_verified_at = now
                # Auto-activate (SSL handled by Caddy)
                domain_obj.ssl_status = 'active'
                domain_obj.is_active = True
                domain_obj.save()
                self.stdout.write(self.style.SUCCESS(
                    f'  OK {domain_obj.domain} — verified & active'
                ))
            else:
                # If was active but DNS changed, deactivate
                if was_active:
                    domain_obj.dns_status = 'failed'
                    domain_obj.is_active = False
                    domain_obj.save()
                    self.stdout.write(self.style.WARNING(
                        f'  DEACTIVATED {domain_obj.domain} — DNS no longer resolves'
                    ))
                else:
                    domain_obj.dns_status = 'failed'
                    domain_obj.save()
                    self.stdout.write(self.style.WARNING(
                        f'  FAIL {domain_obj.domain} — DNS not configured'
                    ))

        except Exception as e:
            domain_obj.dns_status = 'failed'
            domain_obj.save()
            self.stdout.write(self.style.ERROR(
                f'  ERROR {domain_obj.domain} — {e}'
            ))

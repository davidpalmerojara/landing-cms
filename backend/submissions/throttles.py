from rest_framework.throttling import AnonRateThrottle

from accounts.throttles import CurrentRatesMixin


class ContactRateThrottle(CurrentRatesMixin, AnonRateThrottle):
    """Per-IP limit on the public contact form (5/minute by default)."""
    scope = 'contact'

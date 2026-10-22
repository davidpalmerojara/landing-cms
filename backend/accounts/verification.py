"""Who publishes with the demo's protections (C5, ADR-051).

Anyone can register with any address in one request, and published pages live
on the app's own origin. Until the owner proves the email (a magic link or
Google), their published pages get what guest pages get (ADR-022): noindex
and out of the sitemap, no Custom HTML, a contact form that does not send, and
a notice for visitors. Guests always do.
"""
from django.db.models import Q


def publishes_restricted(user) -> bool:
    """A page of this owner is published with the guest protections."""
    return user is None or user.is_guest or not user.email_verified


def verified_owner_filter() -> Q:
    """Pages whose owner publishes without restrictions (for querysets of Page)."""
    return Q(owner__is_guest=False, owner__email_verified=True)

"""Closing every session of an account.

Access tokens are stateless JWTs, so revoking them means remembering when the
account was logged out everywhere and rejecting tokens issued before that.
Refresh tokens are blacklisted as well.
"""
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_all_sessions(user):
    """Log the user out everywhere. The caller saves `sessions_revoked_at`."""
    user.sessions_revoked_at = timezone.now()
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def issued_before_revocation(user, token) -> bool:
    """True when the token was issued before the user's sessions were revoked."""
    revoked_at = user.sessions_revoked_at
    if revoked_at is None:
        return False
    issued_at = token.get('iat')
    # iat has one-second resolution: tokens issued in the second of the
    # revocation (the new session itself) are kept
    return issued_at is None or issued_at < int(revoked_at.timestamp())

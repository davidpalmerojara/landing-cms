"""What happens when someone proves they control an account's email."""
from .sessions import revoke_all_sessions


def confirm_email_owner(user) -> bool:
    """Mark the email as verified after a magic link or Google sign-in.

    Sign-up with a password does not verify the email, so that password may
    belong to someone who registered this address before its owner did
    (pre-account takeover). When the owner proves control of the email, that
    password stops working, every other session is closed and the pages are no
    longer shared with anyone. Returns True when a password was disabled.
    """
    if user.email_verified:
        return False

    from pages.models import Page

    took_over = user.has_usable_password()
    user.email_verified = True
    fields = ['email_verified', 'updated_at']
    if took_over:
        user.set_unusable_password()
        revoke_all_sessions(user)
        Page.collaborators.through.objects.filter(page__owner=user).delete()
        fields += ['password', 'sessions_revoked_at']
    user.save(update_fields=fields)
    return took_over

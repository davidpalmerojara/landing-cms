import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class User(AbstractUser):
    """Extended user with UUID and avatar support."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    avatar = models.URLField(blank=True, default='')
    email = models.EmailField(unique=True)
    google_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    # Set once someone proves control of the email (magic link or Google).
    # Sign-up with a password does not prove it.
    email_verified = models.BooleanField(default=False)
    # Tokens issued before this instant are rejected (see accounts/sessions.py)
    sessions_revoked_at = models.DateTimeField(null=True, blank=True)
    # Temporary "try it without signing up" account (see accounts/guests.py).
    # It is deleted GUEST_LIFETIME_HOURS after created_at unless it is claimed.
    is_guest = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['is_guest', 'created_at'], name='user_guest_created_idx')]
        constraints = [
            # Email and username are unique ignoring case (D8): `Demo@x.com` and
            # `demo@x.com` are the same person, `DEMO` and `demo` the same name.
            models.UniqueConstraint(Lower('email'), name='user_email_ci_unique'),
            models.UniqueConstraint(Lower('username'), name='user_username_ci_unique'),
        ]

    def save(self, *args, **kwargs):
        # Emails are stored lower-cased so every lookup and the uniqueness
        # constraint see one spelling; `save(update_fields=[...])` without
        # `email` leaves it alone.
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email or self.username


class MagicToken(models.Model):
    """One-time token for passwordless login via email."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def is_expired(self):
        return timezone.now() > self.created_at + timedelta(minutes=15)

    def __str__(self):
        return f"MagicToken for {self.email}"


class SentEmail(models.Model):
    """One email that left the server: the global daily cap and the
    per-recipient caps are counted here (ADR-049).

    The recipient is kept only as a SHA-256 of the lower-cased address, which
    is enough to count and does not say who it was. Rows are pruned after a
    few days (`accounts.mailing.prune_sent_emails`)."""

    class Kind(models.TextChoices):
        MAGIC_LINK = 'magic_link', 'Magic link'
        SHARE = 'share', 'Share notice'

    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    recipient_hash = models.CharField(max_length=64)
    # The shared page, for share notices: one notice per page and recipient
    page_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['created_at'], name='sentemail_created_idx'),
            models.Index(fields=['recipient_hash', 'created_at'], name='sentemail_recipient_idx'),
        ]

    def __str__(self):
        return f'{self.kind} at {self.created_at:%Y-%m-%d %H:%M}'

import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """Extended user with UUID and avatar support."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    avatar = models.URLField(blank=True, default='')
    email = models.EmailField(unique=True)
    google_id = models.CharField(max_length=255, blank=True, default='', db_index=True)

    # AI generation settings — user provides their own API key
    ai_provider = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text='gemini or anthropic',
    )
    ai_api_key = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

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

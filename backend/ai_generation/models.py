import uuid
from django.conf import settings
from django.db import models


class AIGenerationLog(models.Model):
    """Tracks AI generation usage for cost monitoring and rate limiting."""

    class Mode(models.TextChoices):
        FULL_PAGE = 'full_page', 'Full Page'
        SINGLE_BLOCK = 'single_block', 'Single Block'
        EDIT_BLOCK = 'edit_block', 'Edit Block'

    class Source(models.TextChoices):
        DEMO = 'demo', 'Saved demo response'
        LIVE = 'live', 'Server key'
        OWN_KEY = 'own_key', "User's own key"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ai_generations',
    )
    # Where the answer came from. Only live counts against the plan and the daily caps.
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.LIVE)
    page = models.ForeignKey(
        'pages.Page',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ai_generations',
    )
    prompt = models.TextField()
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.FULL_PAGE)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    cost_estimate = models.DecimalField(max_digits=8, decimal_places=5, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['source', 'created_at'])]

    def __str__(self):
        return f'{self.mode} — {self.user.username} — {self.created_at:%Y-%m-%d %H:%M}'

import uuid

from django.db import models


class FormSubmission(models.Model):
    """A message sent through a contact block on a published page.

    Stored as plain text. No IP address or other visitor identifier is kept.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        'pages.Page',
        on_delete=models.CASCADE,
        related_name='submissions',
    )
    block_id = models.UUIDField(null=True, blank=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(max_length=254)
    message = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['page', '-created_at'], name='submission_page_created_idx'),
        ]

    def __str__(self):
        return f'{self.name} <{self.email}> — {self.page_id}'

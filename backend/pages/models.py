import uuid
from django.conf import settings
from django.db import models


class Workspace(models.Model):
    """Groups pages under an owner."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='workspaces',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Page(models.Model):
    """A landing page composed of ordered blocks."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pages',
        null=True,
        blank=True,
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='workspace_pages',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=200, default='Untitled Page')
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='shared_pages',
        blank=True,
    )
    theme_id = models.CharField(max_length=50, default='default', blank=True)
    custom_theme = models.JSONField(default=dict, blank=True)
    design_tokens = models.JSONField(default=dict, blank=True)

    # SEO fields
    seo_title = models.CharField(max_length=70, blank=True, default='')
    seo_description = models.CharField(max_length=160, blank=True, default='')
    seo_canonical_url = models.URLField(max_length=500, blank=True, default='')
    og_title = models.CharField(max_length=200, blank=True, default='')
    og_description = models.CharField(max_length=300, blank=True, default='')
    og_image = models.URLField(max_length=500, blank=True, default='')
    og_type = models.CharField(max_length=50, default='website', blank=True)
    noindex = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['owner', 'status'], name='page_owner_status_idx'),
            models.Index(fields=['workspace', 'status'], name='page_workspace_status_idx'),
            models.Index(fields=['-updated_at'], name='page_updated_at_idx'),
            models.Index(fields=['slug'], name='page_slug_idx'),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            base_slug = slugify(self.name) or 'page'
            slug = base_slug
            counter = 1
            while Page.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base_slug}-{counter}'
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)


class Block(models.Model):
    """A single section/block within a page."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='blocks',
    )
    type = models.CharField(max_length=50)
    order = models.PositiveIntegerField(default=0)
    data = models.JSONField(default=dict, blank=True)
    styles = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.type} (#{self.order}) — {self.page.name}'


class PageVersion(models.Model):
    """Snapshot of a page's blocks at a point in time."""

    class Trigger(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        AUTO_PUBLISH = 'auto_publish', 'Al publicar'
        AUTO_RESTORE = 'auto_restore', 'Antes de restaurar'
        AUTO_AI = 'auto_ai_generation', 'Antes de generación IA'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(
        Page,
        on_delete=models.CASCADE,
        related_name='versions',
    )
    version_number = models.PositiveIntegerField()
    snapshot = models.JSONField(
        help_text='Complete array of blocks [{id, type, order, data, styles}, ...]',
    )
    page_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Page-level fields at the time of snapshot (name, slug, theme_id, etc.)',
    )
    trigger = models.CharField(max_length=20, choices=Trigger.choices, default=Trigger.MANUAL)
    label = models.CharField(max_length=200, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='page_versions',
    )
    size_bytes = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version_number']
        indexes = [
            models.Index(fields=['page', 'version_number']),
            models.Index(fields=['page', 'created_at']),
        ]
        unique_together = [('page', 'version_number')]

    def __str__(self):
        return f'{self.page.name} v{self.version_number} ({self.get_trigger_display()})'


def create_version_snapshot(page, user, trigger, label=''):
    """
    Capture the current state of a page's blocks as a PageVersion.

    Handles auto-incrementing version_number and plan-based version limits.
    Returns the created PageVersion instance.
    """
    import json
    from billing.permissions import get_user_plan

    # Build snapshot from current blocks
    blocks = page.blocks.order_by('order').values('id', 'type', 'order', 'data', 'styles')
    snapshot = []
    for b in blocks:
        snapshot.append({
            'id': str(b['id']),
            'type': b['type'],
            'order': b['order'],
            'data': b['data'],
            'styles': b['styles'],
        })

    # Page metadata
    page_metadata = {
        'name': page.name,
        'slug': page.slug,
        'status': page.status,
        'theme_id': page.theme_id,
        'custom_theme': page.custom_theme,
        'design_tokens': page.design_tokens,
        'seo_title': page.seo_title,
        'seo_description': page.seo_description,
        'seo_canonical_url': page.seo_canonical_url,
        'og_title': page.og_title,
        'og_description': page.og_description,
        'og_image': page.og_image,
        'og_type': page.og_type,
        'noindex': page.noindex,
    }

    # Next version number
    last_version = page.versions.order_by('-version_number').values_list(
        'version_number', flat=True
    ).first()
    next_number = (last_version or 0) + 1

    # Calculate size
    snapshot_json = json.dumps(snapshot, ensure_ascii=False)
    size_bytes = len(snapshot_json.encode('utf-8'))

    version = PageVersion.objects.create(
        page=page,
        version_number=next_number,
        snapshot=snapshot,
        page_metadata=page_metadata,
        trigger=trigger,
        label=label,
        created_by=user,
        size_bytes=size_bytes,
    )

    # Enforce plan-based version limit
    plan = get_user_plan(page.owner)
    max_versions = getattr(plan, 'max_version_history', 5)
    if max_versions != -1:
        version_ids = list(
            page.versions.order_by('-version_number')
            .values_list('id', flat=True)[max_versions:]
        )
        if version_ids:
            PageVersion.objects.filter(id__in=version_ids).delete()

    return version


class Asset(models.Model):
    """Uploaded file/image for use in pages."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='assets',
        null=True,
        blank=True,
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='assets',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=200)
    file = models.FileField(upload_to='assets/%Y/%m/')
    mime_type = models.CharField(max_length=100, blank=True, default='')
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class CustomDomain(models.Model):
    """Custom domain mapped to a published page."""

    class DnsStatus(models.TextChoices):
        PENDING = 'pending', 'Pendiente'
        VERIFIED = 'verified', 'Verificado'
        FAILED = 'failed', 'Fallido'

    class SslStatus(models.TextChoices):
        PENDING = 'pending', 'Pendiente'
        PROVISIONING = 'provisioning', 'Provisionando'
        ACTIVE = 'active', 'Activo'
        EXPIRED = 'expired', 'Expirado'
        FAILED = 'failed', 'Fallido'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name='custom_domains',
        null=True,
        blank=True,
    )
    page = models.ForeignKey(
        Page,
        on_delete=models.SET_NULL,
        related_name='custom_domains',
        null=True,
        blank=True,
    )
    domain = models.CharField(max_length=253, unique=True)
    dns_status = models.CharField(
        max_length=20,
        choices=DnsStatus.choices,
        default=DnsStatus.PENDING,
    )
    dns_verified_at = models.DateTimeField(null=True, blank=True)
    ssl_status = models.CharField(
        max_length=20,
        choices=SslStatus.choices,
        default=SslStatus.PENDING,
    )
    ssl_provisioned_at = models.DateTimeField(null=True, blank=True)
    ssl_expires_at = models.DateTimeField(null=True, blank=True)
    last_dns_check_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['domain']),
            models.Index(fields=['dns_status']),
        ]

    def __str__(self):
        status = 'active' if self.is_active else self.dns_status
        return f'{self.domain} ({status})'

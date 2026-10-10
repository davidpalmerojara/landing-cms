import uuid
from datetime import timedelta

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import IntegrityError, models, transaction
from django.db.models import Q

INVITE_LIFETIME = timedelta(hours=24)
INVITE_MAX_USES = 5

OG_TYPE_CHOICES = (('website', 'website'), ('article', 'article'))
DEFAULT_PAGE_LANGUAGE = 'es'
# A BCP 47 language tag as `<html lang>` takes it: "es", "en", "pt-BR", "zh-Hant"
language_tag_validator = RegexValidator(
    r'^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$',
    'Usa un código de idioma como es, en o pt-BR.',
)


def pages_accessible_to(user):
    """Pages the user owns or collaborates on, each one once (the collaborators
    join returns one row per collaborator, so an owner with two collaborators
    would otherwise get the same page twice)."""
    return Page.objects.filter(Q(owner=user) | Q(collaborators=user)).distinct()


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
    # The page theme: colours, typography, spacing, borders. {} = defaults. See pages/design_tokens.py
    design_tokens = models.JSONField(default=dict, blank=True)

    # SEO fields
    seo_title = models.CharField(max_length=70, blank=True, default='')
    seo_description = models.CharField(max_length=160, blank=True, default='')
    seo_canonical_url = models.URLField(max_length=500, blank=True, default='')
    og_title = models.CharField(max_length=200, blank=True, default='')
    og_description = models.CharField(max_length=300, blank=True, default='')
    og_image = models.URLField(max_length=500, blank=True, default='')
    # Only the types the published page's metadata accepts (Next throws on others)
    og_type = models.CharField(max_length=50, choices=OG_TYPE_CHOICES, default='website', blank=True)
    noindex = models.BooleanField(default=False)
    # Language of the page's content: the published page's <html lang> (WCAG 3.1.1)
    language = models.CharField(
        max_length=12,
        default=DEFAULT_PAGE_LANGUAGE,
        validators=[language_tag_validator],
    )

    # What the public sees: a frozen copy taken when the page was published.
    # Edits (and autosaves) change the draft, not this, until the next publish.
    published_version = models.ForeignKey(
        'PageVersion',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    published_at = models.DateTimeField(null=True, blank=True)

    # Optimistic concurrency (ADR-024): bumped by every write that changes the
    # page. A save based on an older version is refused with 409.
    version = models.PositiveIntegerField(default=1)

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

    @property
    def has_unpublished_changes(self) -> bool:
        """The draft was edited after the last publish."""
        if self.status != self.Status.PUBLISHED or self.published_at is None:
            return False
        return self.updated_at > self.published_at

    def publish(self, user):
        """Freeze the current draft as the public version."""
        from django.core.cache import cache
        from django.utils import timezone

        version = create_version_snapshot(self, user, PageVersion.Trigger.AUTO_PUBLISH, label='Publicación')
        self.published_version = version
        self.published_at = timezone.now()
        self.status = self.Status.PUBLISHED
        # update_fields leaves updated_at alone, so the draft counts as published
        self.save(update_fields=['published_version', 'published_at', 'status'])
        cache.delete('sitemap_xml')
        return version

    def unpublish(self):
        from django.core.cache import cache

        self.status = self.Status.DRAFT
        self.save(update_fields=['status'])
        cache.delete('sitemap_xml')

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
        is_update = not self._state.adding and self.pk is not None and not kwargs.get('force_insert')
        if is_update and kwargs.get('update_fields') is None:
            # `version` only moves through atomic UPDATEs in pages/sync.py. A page
            # loaded earlier and saved later must not write its old version back.
            kwargs['update_fields'] = [
                f.name for f in self._meta.concrete_fields if not f.primary_key and f.name != 'version'
            ]
        super().save(*args, **kwargs)


def new_invite_token() -> str:
    import secrets
    return secrets.token_urlsafe(24)


def default_invite_expiry():
    from django.utils import timezone
    return timezone.now() + INVITE_LIFETIME


class PageInvite(models.Model):
    """A link that adds whoever opens it as a collaborator of the page.

    Short-lived and limited in uses so it can be pasted into another browser
    ("open it in incognito") without leaving a permanent door open.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='invites')
    token = models.CharField(max_length=64, unique=True, default=new_invite_token, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='page_invites',
    )
    expires_at = models.DateTimeField(default=default_invite_expiry)
    max_uses = models.PositiveSmallIntegerField(default=INVITE_MAX_USES)
    uses = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['expires_at'])]

    def __str__(self):
        return f'Invite to {self.page_id} (expires {self.expires_at:%Y-%m-%d %H:%M})'


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
        help_text='Page-level fields at the time of snapshot (name, slug, design_tokens, etc.)',
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


VERSION_NUMBER_ATTEMPTS = 3


def lock_page(page_id):
    """The page row, locked until the surrounding transaction ends, so whole-page
    writes (restore, AI generation, snapshots) of one page queue up instead of
    interleaving their blocks. Call inside transaction.atomic()."""
    return Page.objects.select_for_update().get(pk=page_id)


def _page_metadata(page):
    return {
        'name': page.name,
        'slug': page.slug,
        'status': page.status,
        'language': page.language,
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


def _create_version_row(page, user, trigger, label):
    """Read the blocks and insert the next numbered version while holding the
    page's row lock: two snapshots of one page (a save and an AI edit, a publish
    and a restore) can neither read the same number nor see half-replaced blocks."""
    import json

    with transaction.atomic():
        # Lock only; SQLite has no row locks but serializes writers itself
        lock_page(page.pk)

        blocks = page.blocks.order_by('order').values('id', 'type', 'order', 'data', 'styles')
        snapshot = [
            {
                'id': str(b['id']),
                'type': b['type'],
                'order': b['order'],
                'data': b['data'],
                'styles': b['styles'],
            }
            for b in blocks
        ]
        last_version = page.versions.order_by('-version_number').values_list(
            'version_number', flat=True
        ).first()
        size_bytes = len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8'))
        return PageVersion.objects.create(
            page=page,
            version_number=(last_version or 0) + 1,
            snapshot=snapshot,
            page_metadata=_page_metadata(page),
            trigger=trigger,
            label=label,
            created_by=user,
            size_bytes=size_bytes,
        )


def max_versions_for(page):
    """How many versions the page keeps: the owner's plan decides (-1: all).
    Guests keep GUEST_MAX_VERSIONS. Older ones are pruned when a new one is saved."""
    from billing.permissions import get_user_plan

    if getattr(page.owner, 'is_guest', False):
        from accounts.guests import GUEST_MAX_VERSIONS
        return GUEST_MAX_VERSIONS
    return getattr(get_user_plan(page.owner), 'max_version_history', 5)


def create_version_snapshot(page, user, trigger, label=''):
    """
    Capture the current state of a page's blocks as a PageVersion.

    Handles auto-incrementing version_number and plan-based version limits.
    Returns the created PageVersion instance.
    """
    for attempt in range(1, VERSION_NUMBER_ATTEMPTS + 1):
        try:
            version = _create_version_row(page, user, trigger, label)
            break
        except IntegrityError:
            # Databases without row locks (SQLite) can still hand two writers the
            # same number; the unique constraint refuses the second, which retries.
            if attempt == VERSION_NUMBER_ATTEMPTS:
                raise

    # Enforce plan-based version limit
    max_versions = max_versions_for(page)
    if max_versions != -1:
        version_ids = list(
            page.versions.order_by('-version_number')
            .exclude(id=page.published_version_id)  # never prune what the public is seeing
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

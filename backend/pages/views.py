import logging
import uuid
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from django.utils.html import escape
from rest_framework import viewsets, status, generics, mixins, parsers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from accounts.permissions import IsNotGuest
from config.features import CustomDomainsEnabled
from .block_validators import clean_block_data
from .models import (
    Page, Block, Asset, PageVersion, PageInvite, CustomDomain,
    DEFAULT_PAGE_LANGUAGE, OG_TYPE_CHOICES, create_version_snapshot, language_tag_validator, lock_page,
    pages_accessible_to,
)
from .permissions import require_page_owner
from .revalidation import revalidate_public_pages
from . import sync
from .serializers import (
    PageListSerializer, PageDetailSerializer, AssetSerializer, PreviewBlockSerializer,
    PageVersionListSerializer, PageVersionDetailSerializer, LIST_PREVIEW_BLOCKS, PREVIEW_BLOCKS_ATTR,
    CustomDomainSerializer, SharePageSerializer, UnsharePageSerializer, VersionLabelSerializer,
)

logger = logging.getLogger(__name__)


class InvalidVersionData(Exception):
    """A version snapshot holds data the editor would not accept."""


def get_or_create_user_workspace(user):
    """Return the user's primary workspace, creating one if needed."""
    workspace = user.workspaces.first()
    if workspace:
        return workspace

    from .models import Workspace
    return Workspace.objects.create(
        owner=user,
        name=f"{user.username}'s workspace",
    )


RESTORABLE_METADATA_FIELDS = (
    'name', 'design_tokens', 'language',
    'seo_title', 'seo_description', 'seo_canonical_url',
    'og_title', 'og_description', 'og_image', 'og_type', 'noindex',
)


PUBLISHED_METADATA_FIELDS = (
    'name', 'design_tokens', 'language',
    'seo_title', 'seo_description', 'seo_canonical_url',
    'og_title', 'og_description', 'og_image', 'og_type', 'noindex',
)


class PublicPageView(generics.RetrieveAPIView):
    """
    GET /api/public/pages/{slug}/ — public access to the published version.

    Serves the frozen copy taken at publish time (blocks, theme, tokens and
    SEO), never the live draft, so edits only reach visitors when the owner
    publishes again (ADR-017).
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    # Read-only and cached by Next, and its only client is the Next server (one
    # IP): the default anonymous throttle would let any bot exhaust it and turn
    # every published page into a 500 (QA-006)
    throttle_classes = []
    lookup_field = 'slug'

    def get_queryset(self):
        return (
            Page.objects
            .filter(status=Page.Status.PUBLISHED, published_version__isnull=False)
            .select_related('owner', 'published_version')
        )

    def retrieve(self, request, *args, **kwargs):
        from billing.permissions import get_user_plan

        page = self.get_object()
        version = page.published_version
        meta = version.page_metadata
        published = page.published_at.isoformat() if page.published_at else None
        plan = get_user_plan(page.owner)
        # A guest's page is a demo: never indexed, always with the watermark
        is_guest_page = page.owner.is_guest if page.owner else False
        seo = {field: meta.get(field, getattr(page, field)) for field in PUBLISHED_METADATA_FIELDS}
        blocks = sorted(version.snapshot, key=lambda b: b.get('order', 0))
        if is_guest_page:
            seo['noindex'] = True
            # Anyone can create a guest: their pages must not be usable for
            # phishing on this domain. No custom HTML, and the client shows a
            # notice and keeps the contact form from sending.
            blocks = [b for b in blocks if b.get('type') != 'customHtml']
        return Response({
            'id': str(page.id),
            'slug': page.slug,
            'status': page.status,
            **seo,
            'blocks': blocks,
            'published_at': published,
            'updated_at': published,
            'show_watermark': is_guest_page or not getattr(plan, 'remove_watermark', False),
            'is_guest_page': is_guest_page,
        })


class PageViewSet(viewsets.ModelViewSet):
    """
    CRUD for landing pages with nested blocks.
    Each user only sees and edits their own pages.
    """
    lookup_field = 'id'

    def get_queryset(self):
        queryset = pages_accessible_to(self.request.user).select_related('owner')
        if self.action == 'list':
            # The dashboard card previews the first blocks: loading every block of
            # every page made the list cost seconds for big pages (QA-103)
            return queryset.annotate(block_total=Count('blocks', distinct=True)).prefetch_related(
                Prefetch(
                    'blocks',
                    queryset=Block.objects.order_by('order')[:LIST_PREVIEW_BLOCKS],
                    to_attr=PREVIEW_BLOCKS_ATTR,
                )
            )
        return queryset.prefetch_related(Prefetch('blocks', queryset=Block.objects.order_by('order')))

    def get_serializer_class(self):
        if self.action == 'list':
            return PageListSerializer
        return PageDetailSerializer

    def perform_create(self, serializer):
        from billing.permissions import check_page_limit
        check_page_limit(self.request.user)
        serializer.save(
            owner=self.request.user,
            workspace=get_or_create_user_workspace(self.request.user),
        )

    @staticmethod
    def _parse_base_version(data):
        """The version the client's edit is based on, or None if missing or not an integer."""
        value = data.get('version') if hasattr(data, 'get') else None
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
        return None

    def update(self, request, *args, **kwargs):
        """PUT/PATCH /api/pages/{id}/ — save, refused with 409 if the page moved on (ADR-024)."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        base_version = self._parse_base_version(request.data)
        if base_version is None:
            return Response(
                {'error': 'Falta la versión de la página en la que se basa el cambio.', 'code': 'VERSION_REQUIRED'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if base_version != instance.version:
            return self._version_conflict(instance.pk, request)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                # First statement: the conditional bump decides which of two
                # simultaneous saves wins and holds the row until we commit.
                sync.claim_version(instance, base_version)
                serializer.save()
        except sync.VersionConflict:
            return self._version_conflict(instance.pk, request)

        sync.notify_page_updated(instance, sync.REASON_SAVE, request.user, sync.connection_id_from(request))
        return Response(serializer.data)

    def _version_conflict(self, page_id, request):
        current = self.get_queryset().get(pk=page_id)
        logger.info('Version conflict saving page %s (user %s)', page_id, request.user.pk)
        return Response(
            {
                'error': 'La página ha cambiado desde la versión en la que te basas.',
                'code': 'VERSION_CONFLICT',
                'page': PageDetailSerializer(current, context={'request': request}).data,
            },
            status=status.HTTP_409_CONFLICT,
        )

    def perform_destroy(self, instance):
        require_page_owner(instance, self.request.user, 'Solo el propietario puede eliminar esta página.')
        slug = instance.slug
        page_id = instance.pk
        instance.delete()
        # Everyone with the editor open, owner's other tabs included, must stop
        # now: their sockets would otherwise sit on a page that no longer exists
        sync.notify_page_deleted(page_id)
        revalidate_public_pages(slug)

    @action(detail=True, methods=['post'])
    def publish(self, request, id=None):
        """POST /api/pages/{id}/publish/ — freeze the current draft as the public page. Owner only."""
        page = self.get_object()
        require_page_owner(page, request.user, 'Solo el propietario puede publicar esta página.')
        page.publish(request.user)
        sync.bump_version(page)
        revalidate_public_pages(page.slug)
        sync.notify_page_updated(page, sync.REASON_PUBLISH, request.user, sync.connection_id_from(request))
        return Response(PageDetailSerializer(page, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, id=None):
        """POST /api/pages/{id}/unpublish/ — take the public page offline. Owner only."""
        page = self.get_object()
        require_page_owner(page, request.user, 'Solo el propietario puede despublicar esta página.')
        page.unpublish()
        sync.bump_version(page)
        revalidate_public_pages(page.slug)
        sync.notify_page_updated(page, sync.REASON_PUBLISH, request.user, sync.connection_id_from(request))
        return Response(PageDetailSerializer(page, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, id=None):
        """POST /api/pages/{id}/duplicate/ — clone a page with all its blocks. Owner only."""
        from billing.permissions import check_page_limit
        original = self.get_object()
        require_page_owner(original, request.user, 'Solo el propietario puede duplicar esta página.')
        check_page_limit(request.user)
        blocks = list(original.blocks.all())

        original.pk = None
        original._state.adding = True  # a new row, not an update of the original
        original.slug = ''
        original.name = f'{original.name} (copy)'
        original.status = Page.Status.DRAFT
        original.published_version = None
        original.published_at = None
        original.version = 1
        original.owner = request.user
        original.workspace = get_or_create_user_workspace(request.user)
        original.save()

        for block in blocks:
            block.pk = None
            block.page = original
            block.save()

        serializer = PageDetailSerializer(original)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsNotGuest])
    def share(self, request, id=None):
        """POST /api/pages/{id}/share/ — add a collaborator by email."""
        from django.contrib.auth import get_user_model
        User = get_user_model()

        page = self.get_object()
        require_page_owner(page, request.user, 'Solo el propietario puede compartir esta página.')

        input_serializer = SharePageSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        email = input_serializer.validated_data['email']

        target_user = User.objects.filter(email__iexact=email).first()
        if not target_user:
            # Return generic success to prevent user enumeration
            return Response({'message': 'Si el usuario existe, se le ha compartido la página.'})

        if target_user == request.user:
            return Response(
                {'error': 'No puedes compartir contigo mismo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.collaborators.add(target_user)

        # Send notification email. The page name and the username are typed by
        # the sender: text in the plain body, escaped in the HTML one, and
        # without line breaks in the subject (header injection).
        from django.core.mail import send_mail
        from django.conf import settings as django_settings
        frontend_url = django_settings.FRONTEND_URL.rstrip('/')
        editor_url = f"{frontend_url}/editor/{page.pk}"
        inviter = ' '.join(request.user.username.split())
        page_name = ' '.join(page.name.split())
        try:
            send_mail(
                subject=f'{inviter} te ha invitado a colaborar en "{page_name}"',
                message=(
                    f'{inviter} te ha invitado a editar la página "{page_name}" en Paxl.\n\n'
                    f'Abre el editor: {editor_url}\n'
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[target_user.email],
                html_message=(
                    f'<p><strong>{escape(inviter)}</strong> te ha invitado a colaborar '
                    f'en la página <strong>"{escape(page_name)}"</strong>.</p>'
                    f'<p><a href="{editor_url}" style="display:inline-block;background:#2563EB;color:#fff;'
                    f'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">'
                    f'Abrir editor</a></p>'
                ),
            )
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                'Failed to send share notification email to %s for page %s',
                target_user.email, page.pk, exc_info=True,
            )

        return Response({'message': f'Página compartida con {target_user.username}.'})

    @action(detail=True, methods=['get'])
    def collaborators(self, request, id=None):
        """GET /api/pages/{id}/collaborators/ — list collaborators."""
        page = self.get_object()
        is_owner = page.owner == request.user
        collabs = page.collaborators.all().values('id', 'username', 'email')
        # Only expose emails to the page owner
        if not is_owner:
            collabs = [{'id': c['id'], 'username': c['username']} for c in collabs]
        else:
            collabs = list(collabs)
        owner_data = {
            'id': str(page.owner.pk),
            'username': page.owner.username,
        }
        if is_owner:
            owner_data['email'] = page.owner.email
        return Response({
            'owner': owner_data,
            'collaborators': collabs,
        })

    @action(detail=True, methods=['post'])
    def unshare(self, request, id=None):
        """POST /api/pages/{id}/unshare/ — remove a collaborator by user id."""
        page = self.get_object()
        require_page_owner(page, request.user, 'Solo el propietario puede gestionar colaboradores.')

        input_serializer = UnsharePageSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        user_id = input_serializer.validated_data['user_id']

        removed = page.collaborators.filter(pk=user_id).first()
        if not removed:
            return Response(
                {'error': 'Ese usuario no es colaborador de esta página.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        page.collaborators.remove(removed)
        # Their open editors must stop working now, not at the next reconnect
        sync.notify_access_revoked(page.pk, removed.pk)
        return Response({'message': f'{removed.username} eliminado como colaborador.'})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def invite(self, request, id=None):
        """POST /api/pages/{id}/invite/ — a link that adds whoever opens it as a collaborator.

        Owner only. Guests may create it (unlike share, it sends no email), so a
        visitor can open their page in another browser to try collaboration.
        """
        page = self.get_object()
        require_page_owner(page, request.user, 'Solo el propietario puede invitar a esta página.')
        # Old links stay valid until they expire; only the dead ones are swept
        PageInvite.objects.filter(page=page, expires_at__lte=timezone.now()).delete()
        invite = PageInvite.objects.create(page=page, created_by=request.user)
        return Response(
            {
                'token': invite.token,
                'path': f'/join/{invite.token}',
                'expires_at': invite.expires_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class VersionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 50


class PageVersionViewSet(viewsets.GenericViewSet):
    """
    Nested under a page: /api/pages/{page_id}/versions/

    GET    /                    — list versions (without snapshot)
    POST   /                    — create manual version
    GET    /{version_id}/       — version detail (with snapshot)
    PATCH  /{version_id}/       — update label
    DELETE /{version_id}/       — delete a version
    POST   /{version_id}/restore/ — restore page to this version
    """
    pagination_class = VersionPagination
    lookup_field = 'id'

    def _get_page(self):
        """Get the page and verify the user has access."""
        page = pages_accessible_to(self.request.user).select_related('owner').filter(pk=self.kwargs['page_id']).first()
        if page is None:
            from rest_framework.exceptions import NotFound
            raise NotFound('Página no encontrada.')
        return page

    def get_queryset(self):
        page = self._get_page()
        return PageVersion.objects.filter(page=page).select_related('created_by')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PageVersionDetailSerializer
        return PageVersionListSerializer

    def list(self, request, page_id=None):
        """GET — list all versions (lightweight, no snapshot)."""
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PageVersionListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = PageVersionListSerializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, page_id=None, id=None):
        """GET /{version_id}/ — full detail including snapshot."""
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')
        serializer = PageVersionDetailSerializer(version)
        return Response(serializer.data)

    def create(self, request, page_id=None):
        """POST — create a manual snapshot of the current page state."""
        page = self._get_page()
        input_serializer = VersionLabelSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        version = create_version_snapshot(
            page=page,
            user=request.user,
            trigger='manual',
            label=input_serializer.validated_data.get('label', ''),
        )
        serializer = PageVersionListSerializer(version)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, page_id=None, id=None):
        """PATCH /{version_id}/ — update the label."""
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')
        input_serializer = VersionLabelSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        label = input_serializer.validated_data.get('label')
        if label is not None:
            version.label = label
            version.save(update_fields=['label'])
        serializer = PageVersionListSerializer(version)
        return Response(serializer.data)

    def destroy(self, request, page_id=None, id=None):
        """DELETE /{version_id}/ — delete a version. Owner only; not the last one and not the published one."""
        page = self._get_page()
        require_page_owner(page, request.user, 'Solo el propietario puede eliminar versiones.')
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')
        if version.pk == page.published_version_id:
            return Response(
                {
                    'error': 'Esta es la versión publicada: despublica la página o publica de nuevo antes de eliminarla.',
                    'code': 'PUBLISHED_VERSION',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if page.versions.count() <= 1:
            return Response(
                {'error': 'No se puede eliminar la última versión.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        version.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _clean_snapshot(version):
        """The snapshot's blocks with their data run through clean_block_data.
        Raises InvalidVersionData naming the first block that does not pass."""
        cleaned = []
        for index, block_data in enumerate(version.snapshot):
            try:
                data = clean_block_data(block_data['type'], block_data.get('data', {}))
            except (KeyError, TypeError, AttributeError) as exc:
                logger.warning('Version %s has a malformed block at %s', version.pk, index, exc_info=True)
                raise InvalidVersionData(index) from exc
            except ValidationError as exc:
                logger.warning('Version %s block %s failed validation: %s', version.pk, index, exc.detail)
                raise InvalidVersionData(index) from exc
            cleaned.append({**block_data, 'data': data})
        return cleaned

    @staticmethod
    def _parse_block_id(value):
        try:
            return uuid.UUID(str(value))
        except (ValueError, AttributeError, TypeError):
            return None

    @classmethod
    def _snapshot_block_ids(cls, blocks):
        return [block_id for block_id in (cls._parse_block_id(b.get('id')) for b in blocks) if block_id]

    @classmethod
    def _restored_block_id(cls, snapshot_id, taken_ids):
        """The id the block had, unless another page holds it now (or the snapshot
        repeats it or has none): then a new one. Records the id as taken."""
        block_id = cls._parse_block_id(snapshot_id)
        if block_id is None or block_id in taken_ids:
            block_id = uuid.uuid4()
        taken_ids.add(block_id)
        return block_id

    @staticmethod
    def _restorable_metadata_value(field, value):
        """Old versions may hold values the page no longer accepts (an Open Graph
        type that was removed): fall back to the default instead of writing them back."""
        if field == 'og_type' and value not in dict(OG_TYPE_CHOICES):
            return 'website'
        if field == 'language' and not (isinstance(value, str) and language_tag_validator.regex.match(value)):
            return DEFAULT_PAGE_LANGUAGE
        return value

    @action(detail=True, methods=['post'])
    def restore(self, request, page_id=None, id=None):
        """POST /{version_id}/restore/ — restore page to this version's state."""
        page = self._get_page()
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')

        restore_metadata = request.query_params.get('restore_metadata', '').lower() == 'true'

        # Old snapshots go through the same validation as any save, before
        # anything is deleted: a version with data the editor would reject
        # (stale shape, unsafe link) is not restored.
        try:
            restored_blocks = self._clean_snapshot(version)
        except InvalidVersionData as exc:
            return Response(
                {
                    'error': f'La versión contiene datos que el editor no acepta (bloque {exc.args[0] + 1}).',
                    'code': 'INVALID_VERSION_DATA',
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        with transaction.atomic():
            # Queue behind any other whole-page write (AI generation, another restore)
            lock_page(page.pk)
            # Snapshot current state before restoring
            create_version_snapshot(
                page=page,
                user=request.user,
                trigger='auto_restore',
                label=f'Antes de restaurar v{version.version_number}',
            )

            # Delete all current blocks
            page.blocks.all().delete()

            # Recreate blocks from the snapshot with the ids they had, so an
            # editor that changed one of them meanwhile merges with it instead of
            # keeping its copy next to a new one (QA-012)
            taken_ids = set(
                Block.objects.filter(id__in=self._snapshot_block_ids(restored_blocks)).values_list('id', flat=True)
            )
            for i, block_data in enumerate(restored_blocks):
                Block.objects.create(
                    id=self._restored_block_id(block_data.get('id'), taken_ids),
                    page=page,
                    type=block_data['type'],
                    order=block_data.get('order', i),
                    data=block_data['data'],
                    styles=block_data.get('styles', {}),
                )

            # Optionally restore page metadata
            restored_fields = []
            if restore_metadata and version.page_metadata:
                meta = version.page_metadata
                for field in RESTORABLE_METADATA_FIELDS:
                    if field in meta:
                        setattr(page, field, self._restorable_metadata_value(field, meta[field]))
                        restored_fields.append(field)
            # Only the fields we changed: a full save would write back the version
            # this request loaded and could undo a bump made in the meantime.
            page.save(update_fields=[*restored_fields, 'updated_at'])
            sync.bump_version(page)

        sync.notify_page_updated(page, sync.REASON_RESTORE, request.user, sync.connection_id_from(request))

        # Return updated page
        page.refresh_from_db()
        serializer = PageDetailSerializer(page)
        return Response(serializer.data)


class SitemapView(generics.GenericAPIView):
    """
    GET /api/sitemap/ — XML sitemap of all published, indexable pages.
    Cached for 1 hour in Django cache (Redis if configured, otherwise local memory).
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []  # fetched by crawlers and the Next server; cached (see PublicPageView)

    def get(self, request):
        from django.core.cache import cache
        from django.http import HttpResponse

        cache_key = 'sitemap_xml'
        cached = cache.get(cache_key)
        if cached:
            return HttpResponse(cached, content_type='application/xml')

        pages = Page.objects.filter(
            status=Page.Status.PUBLISHED,
            published_version__page_metadata__noindex=False,
        ).exclude(owner__is_guest=True).values('slug', 'published_at').order_by('-published_at')

        from django.conf import settings as django_settings
        frontend_url = django_settings.FRONTEND_URL.rstrip('/')

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        from xml.sax.saxutils import escape as xml_escape
        for p in pages:
            safe_slug = xml_escape(p['slug'])
            loc = f'{frontend_url}/p/{safe_slug}'
            lastmod = p['published_at'].strftime('%Y-%m-%d')
            lines.append(f'  <url>')
            lines.append(f'    <loc>{loc}</loc>')
            lines.append(f'    <lastmod>{lastmod}</lastmod>')
            lines.append(f'    <changefreq>weekly</changefreq>')
            lines.append(f'    <priority>0.8</priority>')
            lines.append(f'  </url>')
        lines.append('</urlset>')

        xml = '\n'.join(lines)
        cache.set(cache_key, xml, 3600)  # 1 hour TTL

        return HttpResponse(xml, content_type='application/xml')


class ResolveDomainView(generics.GenericAPIView):
    """
    GET /api/public/resolve-domain/?domain=landing.tu-dominio.com
    Returns the page slug for an active custom domain.
    Called by Next.js middleware to route custom domain requests.
    Cached for 5 minutes. 404 FEATURE_DISABLED where custom domains are off.
    """
    permission_classes = [CustomDomainsEnabled, AllowAny]
    authentication_classes = []
    throttle_classes = []  # called by the Next server for every custom-domain request; cached

    def get(self, request):
        from django.core.cache import cache

        domain = request.query_params.get('domain', '').strip().lower()
        if not domain:
            return Response({'error': 'domain parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        cache_key = f'resolve_domain:{domain}'
        cached = cache.get(cache_key)
        if cached is not None:
            if cached == '__not_found__':
                return Response({'error': 'Domain not found'}, status=status.HTTP_404_NOT_FOUND)
            return Response(cached)

        try:
            custom_domain = CustomDomain.objects.select_related('page').get(
                domain=domain,
                is_active=True,
                page__isnull=False,
                page__status=Page.Status.PUBLISHED,
            )
            data = {
                'slug': custom_domain.page.slug,
                'domain_verified': True,
            }
            cache.set(cache_key, data, 300)  # 5 min
            return Response(data)
        except CustomDomain.DoesNotExist:
            cache.set(cache_key, '__not_found__', 60)  # Cache miss for 1 min
            return Response({'error': 'Domain not found'}, status=status.HTTP_404_NOT_FOUND)


class SitemapDataView(generics.GenericAPIView):
    """
    GET /api/public/sitemap-data/ — JSON list for Next.js sitemap generation.
    This endpoint intentionally returns the full published set without
    pagination because it is consumed as a build-time dataset by Next.js and
    should remain a compact, single-response payload.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []  # build-time dataset fetched by the Next server (see PublicPageView)

    def get(self, request):
        pages = Page.objects.filter(
            status=Page.Status.PUBLISHED,
            published_version__page_metadata__noindex=False,
        ).exclude(owner__is_guest=True).values('slug', 'published_at', 'published_version__page_metadata').order_by('-published_at')

        data = [
            {
                'slug': p['slug'],
                'updated_at': p['published_at'].isoformat(),
                'seo_canonical_url': (p['published_version__page_metadata'] or {}).get('seo_canonical_url') or '',
            }
            for p in pages
        ]
        return Response(data)


class CustomDomainViewSet(viewsets.ModelViewSet):
    """
    CRUD for custom domains. Only Pro plan users, and only where the deployment
    turns the feature on (CUSTOM_DOMAINS_ENABLED, ADR-027): otherwise 404 FEATURE_DISABLED.

    POST   /api/domains/              — create domain
    GET    /api/domains/              — list domains
    GET    /api/domains/{id}/         — detail
    PATCH  /api/domains/{id}/         — update page assignment
    DELETE /api/domains/{id}/         — delete domain
    POST   /api/domains/{id}/verify/  — trigger DNS verification
    """
    serializer_class = CustomDomainSerializer
    lookup_field = 'id'
    permission_classes = [CustomDomainsEnabled, IsAuthenticated, IsNotGuest]

    MAX_DOMAINS_PER_USER = 5

    def get_queryset(self):
        return CustomDomain.objects.filter(
            Q(workspace__owner=self.request.user) |
            Q(page__owner=self.request.user)
        ).distinct().select_related('page')

    def perform_create(self, serializer):
        from billing.permissions import get_user_plan

        user = self.request.user
        plan = get_user_plan(user)
        if not getattr(plan, 'has_custom_domain', False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Los dominios personalizados están disponibles en el plan Pro.')

        # Enforce max domains per user
        current_count = CustomDomain.objects.filter(
            Q(workspace__owner=user) | Q(page__owner=user)
        ).distinct().count()
        if current_count >= self.MAX_DOMAINS_PER_USER:
            raise ValidationError(
                {'detail': f'Máximo {self.MAX_DOMAINS_PER_USER} dominios por cuenta.'},
                code='domain_limit',
            )

        # Get workspace from page or user's first workspace
        page = serializer.validated_data.get('page')
        workspace = None
        if page:
            workspace = page.workspace
            if page.owner != user:
                raise ValidationError({'page': 'No tienes permisos sobre esta página.'})
        if not workspace:
            workspace = user.workspaces.first()

        serializer.save(workspace=workspace)

    def perform_update(self, serializer):
        # Only allow changing the page assignment
        page = serializer.validated_data.get('page')
        if page and page.owner != self.request.user:
            raise ValidationError({'page': 'No tienes permisos sobre esta página.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def verify(self, request, id=None):
        """POST /api/domains/{id}/verify/ — manually trigger DNS verification."""
        domain_obj = self.get_object()

        from django.utils import timezone
        import socket

        domain_obj.last_dns_check_at = timezone.now()
        error_msg = ''

        try:
            # Try CNAME resolution
            cname_target = settings.CUSTOM_DOMAINS_CNAME_TARGET
            try:
                import dns.resolver
                answers = dns.resolver.resolve(domain_obj.domain, 'CNAME')
                for rdata in answers:
                    if str(rdata.target).rstrip('.') == cname_target:
                        domain_obj.dns_status = 'verified'
                        domain_obj.dns_verified_at = timezone.now()
                        domain_obj.save()
                        self._maybe_activate(domain_obj)
                        return Response(CustomDomainSerializer(domain_obj).data)
            except ImportError:
                # dnspython not installed, fall back to socket
                pass
            except Exception:
                pass

            # Fallback: check A record via socket
            try:
                ip = socket.gethostbyname(domain_obj.domain)
                if ip:
                    # Domain resolves — mark as verified
                    domain_obj.dns_status = 'verified'
                    domain_obj.dns_verified_at = timezone.now()
                    domain_obj.save()
                    self._maybe_activate(domain_obj)
                    return Response(CustomDomainSerializer(domain_obj).data)
            except socket.gaierror:
                error_msg = f'No se pudo resolver {domain_obj.domain}. Verifica tu configuración DNS.'

        except Exception as e:
            error_msg = str(e)

        domain_obj.dns_status = 'failed'
        domain_obj.save()
        data = CustomDomainSerializer(domain_obj).data
        data['dns_error'] = error_msg or 'Verificación DNS fallida.'
        return Response(data, status=status.HTTP_200_OK)

    def _maybe_activate(self, domain_obj):
        """Activate domain if both DNS and SSL are ready."""
        # For MVP, we delegate SSL to infrastructure (Caddy/Cloudflare)
        # so we auto-activate once DNS is verified.
        if domain_obj.dns_status == 'verified':
            domain_obj.ssl_status = 'active'
            domain_obj.is_active = True
            domain_obj.save()


ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
# SVG excluded from direct upload — contains executable code (XSS risk).
# To support SVG in the future, sanitize with bleach or DOMPurify server-side.
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
IMAGE_EXTENSIONS = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}


def detect_image_type(uploaded_file) -> str | None:
    """Image type from the file's first bytes (its signature), not from the
    Content-Type the client declares, which anyone can set to image/png."""
    head = uploaded_file.read(12)
    uploaded_file.seek(0)
    if head.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if head[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'image/webp'
    return None


class AssetViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/assets/       — list user's assets
    POST /api/assets/       — upload a new asset (multipart)
    DELETE /api/assets/{id}/ — delete an asset
    """
    serializer_class = AssetSerializer
    lookup_field = 'id'
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_permissions(self):
        # Guests cannot upload: checked before the file is read, so a refused upload costs nothing
        if self.action == 'create':
            return [IsAuthenticated(), IsNotGuest()]
        return super().get_permissions()

    def get_queryset(self):
        return Asset.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get('file')
        if not uploaded_file:
            raise ValidationError({'file': 'No se ha subido ningún archivo.'})

        content_type = detect_image_type(uploaded_file)
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValidationError({
                'file': 'El archivo no es una imagen válida. Solo se aceptan JPG, PNG, WebP y GIF.'
            })
        original_name = uploaded_file.name
        # Stored under a random name with the detected extension: a file named
        # evil.html is never served back as HTML from our domain
        uploaded_file.name = f'{uuid.uuid4().hex}.{IMAGE_EXTENSIONS[content_type]}'

        if uploaded_file.size > MAX_FILE_SIZE:
            size_mb = uploaded_file.size / (1024 * 1024)
            raise ValidationError({
                'file': f'El archivo es demasiado grande ({size_mb:.1f} MB). '
                        f'El máximo permitido es 5 MB.'
            })

        serializer.save(
            owner=self.request.user,
            name=original_name[:255],
            mime_type=content_type,
            size=uploaded_file.size,
        )

    def perform_destroy(self, instance):
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()

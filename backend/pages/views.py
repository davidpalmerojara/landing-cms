from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import viewsets, status, generics, mixins, parsers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Page, Block, Asset, PageVersion, CustomDomain, create_version_snapshot
from .serializers import (
    PageListSerializer, PageDetailSerializer, AssetSerializer, PreviewBlockSerializer,
    PageVersionListSerializer, PageVersionDetailSerializer,
    CustomDomainSerializer, SharePageSerializer, UnsharePageSerializer, VersionLabelSerializer,
)


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


class PublicPageView(generics.RetrieveAPIView):
    """
    GET /api/public/pages/{slug}/ — public access, only published pages.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PageDetailSerializer
    lookup_field = 'slug'

    def get_queryset(self):
        return (
            Page.objects
            .filter(status=Page.Status.PUBLISHED)
            .select_related('owner')
            .prefetch_related(Prefetch('blocks', queryset=Block.objects.order_by('order')))
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data

        # Add watermark flag based on owner's plan
        from billing.permissions import get_user_plan
        plan = get_user_plan(instance.owner)
        data['show_watermark'] = not getattr(plan, 'remove_watermark', False)

        return Response(data)


class PageViewSet(viewsets.ModelViewSet):
    """
    CRUD for landing pages with nested blocks.
    Each user only sees and edits their own pages.
    """
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        base_queryset = (
            Page.objects.filter(
                Q(owner=user) | Q(collaborators=user)
            )
            .distinct()
            .select_related('owner')
            .prefetch_related(Prefetch('blocks', queryset=Block.objects.order_by('order')))
        )
        return base_queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return OptimizedPageListSerializer
        return PageDetailSerializer

    def perform_create(self, serializer):
        from billing.permissions import check_page_limit
        check_page_limit(self.request.user)
        serializer.save(
            owner=self.request.user,
            workspace=get_or_create_user_workspace(self.request.user),
        )

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Solo el propietario puede eliminar esta página.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def duplicate(self, request, id=None):
        """POST /api/pages/{id}/duplicate/ — clone a page with all its blocks."""
        from billing.permissions import check_page_limit
        check_page_limit(request.user)
        original = self.get_object()
        blocks = list(original.blocks.all())

        original.pk = None
        original.slug = ''
        original.name = f'{original.name} (copy)'
        original.status = Page.Status.DRAFT
        original.owner = request.user
        original.workspace = get_or_create_user_workspace(request.user)
        original.save()

        for block in blocks:
            block.pk = None
            block.page = original
            block.save()

        serializer = PageDetailSerializer(original)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def share(self, request, id=None):
        """POST /api/pages/{id}/share/ — add a collaborator by email."""
        from django.contrib.auth import get_user_model
        User = get_user_model()

        page = self.get_object()
        if page.owner != request.user:
            return Response(
                {'error': 'Solo el propietario puede compartir esta página.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        input_serializer = SharePageSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        email = input_serializer.validated_data['email']

        target_user = User.objects.filter(email=email).first()
        if not target_user:
            # Return generic success to prevent user enumeration
            return Response({'message': 'Si el usuario existe, se le ha compartido la página.'})

        if target_user == request.user:
            return Response(
                {'error': 'No puedes compartir contigo mismo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.collaborators.add(target_user)

        # Send notification email
        from django.core.mail import send_mail
        from django.conf import settings as django_settings
        frontend_url = django_settings.FRONTEND_URL.rstrip('/')
        editor_url = f"{frontend_url}/editor/{page.pk}"
        try:
            send_mail(
                subject=f'{request.user.username} te ha invitado a colaborar en "{page.name}"',
                message=(
                    f'{request.user.username} te ha invitado a editar la página "{page.name}" en BuilderPro.\n\n'
                    f'Abre el editor: {editor_url}\n'
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[target_user.email],
                html_message=(
                    f'<p><strong>{request.user.username}</strong> te ha invitado a colaborar '
                    f'en la página <strong>"{page.name}"</strong>.</p>'
                    f'<p><a href="{editor_url}" style="display:inline-block;background:#4f46e5;color:#fff;'
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
        if page.owner != request.user:
            return Response(
                {'error': 'Solo el propietario puede gestionar colaboradores.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        return Response({'message': f'{removed.username} eliminado como colaborador.'})


class OptimizedPageListSerializer(PageListSerializer):
    """List serializer that reuses prefetched blocks when the view provides them."""

    def get_preview_blocks(self, obj):
        prefetched_blocks = getattr(obj, '_prefetched_objects_cache', {}).get('blocks')
        if prefetched_blocks is not None:
            return PreviewBlockSerializer(prefetched_blocks[:4], many=True).data
        return super().get_preview_blocks(obj)


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
        page_id = self.kwargs['page_id']
        user = self.request.user
        try:
            return Page.objects.select_related('owner').get(
                Q(owner=user) | Q(collaborators=user),
                id=page_id,
            )
        except Page.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Página no encontrada.')

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
        """DELETE /{version_id}/ — delete a version (cannot delete the last one)."""
        page = self._get_page()
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')
        if page.versions.count() <= 1:
            return Response(
                {'error': 'No se puede eliminar la última versión.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        version.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def restore(self, request, page_id=None, id=None):
        """POST /{version_id}/restore/ — restore page to this version's state."""
        page = self._get_page()
        version = self.get_queryset().filter(id=id).first()
        if not version:
            from rest_framework.exceptions import NotFound
            raise NotFound('Versión no encontrada.')

        restore_metadata = request.query_params.get('restore_metadata', '').lower() == 'true'

        with transaction.atomic():
            # Snapshot current state before restoring
            create_version_snapshot(
                page=page,
                user=request.user,
                trigger='auto_restore',
                label=f'Antes de restaurar v{version.version_number}',
            )

            # Delete all current blocks
            page.blocks.all().delete()

            # Recreate blocks from the snapshot (new UUIDs)
            for i, block_data in enumerate(version.snapshot):
                Block.objects.create(
                    page=page,
                    type=block_data['type'],
                    order=block_data.get('order', i),
                    data=block_data.get('data', {}),
                    styles=block_data.get('styles', {}),
                )

            # Optionally restore page metadata
            if restore_metadata and version.page_metadata:
                meta = version.page_metadata
                for field in ('name', 'theme_id', 'custom_theme', 'design_tokens',
                              'seo_title', 'seo_description', 'seo_canonical_url',
                              'og_title', 'og_description', 'og_image', 'og_type', 'noindex'):
                    if field in meta:
                        setattr(page, field, meta[field])
                page.save()

        # Broadcast via WebSocket if collaboration is active
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f'page_{page_id}',
                    {
                        'type': 'page.restored',
                        'version_number': version.version_number,
                        'restored_by': request.user.username,
                    },
                )
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                'Failed to broadcast version restore via WS for page %s',
                page_id, exc_info=True,
            )

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

    def get(self, request):
        from django.core.cache import cache
        from django.http import HttpResponse

        cache_key = 'sitemap_xml'
        cached = cache.get(cache_key)
        if cached:
            return HttpResponse(cached, content_type='application/xml')

        pages = Page.objects.filter(
            status=Page.Status.PUBLISHED,
            noindex=False,
        ).values('slug', 'updated_at').order_by('-updated_at')

        frontend_url = getattr(
            __import__('django.conf', fromlist=['settings']).settings,
            'FRONTEND_URL', 'https://builderpro.com'
        ).rstrip('/')

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        from xml.sax.saxutils import escape as xml_escape
        for p in pages:
            safe_slug = xml_escape(p['slug'])
            loc = f'{frontend_url}/p/{safe_slug}'
            lastmod = p['updated_at'].strftime('%Y-%m-%d')
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
    GET /api/public/resolve-domain/?domain=landing.miempresa.com
    Returns the page slug for an active custom domain.
    Called by Next.js middleware to route custom domain requests.
    Cached for 5 minutes.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

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

    def get(self, request):
        pages = Page.objects.filter(
            status=Page.Status.PUBLISHED,
            noindex=False,
        ).values('slug', 'updated_at', 'seo_canonical_url').order_by('-updated_at')

        data = [
            {
                'slug': p['slug'],
                'updated_at': p['updated_at'].isoformat(),
                'seo_canonical_url': p['seo_canonical_url'] or '',
            }
            for p in pages
        ]
        return Response(data)


class CustomDomainViewSet(viewsets.ModelViewSet):
    """
    CRUD for custom domains. Only Pro plan users.

    POST   /api/domains/              — create domain
    GET    /api/domains/              — list domains
    GET    /api/domains/{id}/         — detail
    PATCH  /api/domains/{id}/         — update page assignment
    DELETE /api/domains/{id}/         — delete domain
    POST   /api/domains/{id}/verify/  — trigger DNS verification
    """
    serializer_class = CustomDomainSerializer
    lookup_field = 'id'

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
            cname_target = 'domains.builderpro.com'
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

    def get_queryset(self):
        return Asset.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get('file')
        if not uploaded_file:
            raise ValidationError({'file': 'No se ha subido ningún archivo.'})

        content_type = uploaded_file.content_type or ''
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValidationError({
                'file': f'Tipo de archivo no permitido: {content_type}. '
                        f'Solo se aceptan imágenes (JPG, PNG, WebP, GIF, SVG).'
            })

        if uploaded_file.size > MAX_FILE_SIZE:
            size_mb = uploaded_file.size / (1024 * 1024)
            raise ValidationError({
                'file': f'El archivo es demasiado grande ({size_mb:.1f} MB). '
                        f'El máximo permitido es 5 MB.'
            })

        serializer.save(
            owner=self.request.user,
            name=uploaded_file.name,
            mime_type=content_type,
            size=uploaded_file.size,
        )

    def perform_destroy(self, instance):
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()

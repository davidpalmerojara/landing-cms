import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from pages.models import Page
from .models import FormSubmission
from .serializers import ContactSubmissionSerializer, FormSubmissionSerializer
from .throttles import ContactRateThrottle

logger = logging.getLogger(__name__)

# Honeypot field: humans never see it, so any content means a bot filled it in.
HONEYPOT_FIELD = 'website'


def contact_block_ids(page):
    """Ids of the contact blocks in the page's published (frozen) snapshot."""
    version = page.published_version
    if version is None:
        return set()
    return {
        str(block.get('id'))
        for block in version.snapshot
        if isinstance(block, dict) and block.get('type') == 'contact'
    }


class PublicContactView(APIView):
    """
    POST /api/public/pages/{slug}/contact/ — message from a published contact form.

    Only accepted for published pages whose frozen snapshot contains a contact
    block. A non-empty honeypot gets a normal 201 so bots learn nothing, but
    nothing is stored.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ContactRateThrottle]

    def post(self, request, slug):
        page = (
            Page.objects
            .filter(slug=slug, status=Page.Status.PUBLISHED, published_version__isnull=False)
            .select_related('published_version', 'owner')
            .first()
        )
        if page is None:
            return Response(
                {'error': 'Página no encontrada.', 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if page.owner.is_guest:
            # Guest pages are demos anyone can create: they don't collect visitors' data
            return Response(
                {'error': 'Las páginas de prueba no reciben mensajes.', 'code': 'GUEST_PAGE'},
                status=status.HTTP_403_FORBIDDEN,
            )

        block_ids = contact_block_ids(page)
        if not block_ids:
            return Response(
                {'error': 'Esta página no tiene formulario de contacto.', 'code': 'NO_CONTACT_FORM'},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = request.data if hasattr(request.data, 'get') else {}
        honeypot = payload.get(HONEYPOT_FIELD)
        if isinstance(honeypot, str) and honeypot.strip():
            logger.info('Contact honeypot triggered on page %s', page.id)
            return Response({'status': 'received'}, status=status.HTTP_201_CREATED)

        serializer = ContactSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data

        block_id = values.get('block_id')
        if block_id is not None and str(block_id) not in block_ids:
            return Response(
                {'error': 'Formulario de contacto no válido.', 'code': 'INVALID_BLOCK'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        FormSubmission.objects.create(
            page=page,
            block_id=block_id,
            name=values['name'],
            email=values['email'],
            message=values['message'],
        )
        return Response({'status': 'received'}, status=status.HTTP_201_CREATED)


class PageSubmissionViewSet(
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/pages/{page_id}/submissions/       — newest first, paginated
    DELETE /api/pages/{page_id}/submissions/{id}/

    Only the page owner or its collaborators; anyone else gets 404.
    """
    serializer_class = FormSubmissionSerializer
    lookup_field = 'id'

    def get_page(self):
        accessible = Page.objects.filter(
            Q(owner=self.request.user) | Q(collaborators=self.request.user)
        ).distinct()
        return get_object_or_404(accessible, pk=self.kwargs['page_id'])

    def get_queryset(self):
        return FormSubmission.objects.filter(page=self.get_page()).order_by('-created_at')

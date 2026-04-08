from django.db import transaction
from rest_framework import serializers
import re
from .models import Page, Block, Asset, PageVersion, CustomDomain
from .block_sanitizers import sanitize_block_data
from .block_validators import validate_block_data


class AssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = ['id', 'name', 'file', 'url', 'mime_type', 'size', 'created_at']
        read_only_fields = ['id', 'name', 'url', 'mime_type', 'size', 'created_at']
        extra_kwargs = {'file': {'write_only': True}}

    def get_url(self, obj):
        request = self.context.get('request')
        if request and obj.file:
            return request.build_absolute_uri(obj.file.url)
        return ''


class BlockSerializer(serializers.ModelSerializer):
    # Allow id to be sent from frontend for block matching during page update.
    # CharField so non-UUID ids (like "blk_xxx") don't fail validation.
    id = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Block
        fields = ['id', 'type', 'order', 'data', 'styles', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        initial_data = getattr(self, 'initial_data', {}) or {}
        block_type = attrs.get('type') or initial_data.get('type')
        if block_type is None and self.instance is not None:
            block_type = self.instance.type

        data = attrs.get('data')
        if block_type and data is not None:
            try:
                sanitized_data = sanitize_block_data(block_type, data)
                attrs['data'] = validate_block_data(
                    block_type,
                    sanitized_data,
                    partial=self._is_partial_block_update(),
                )
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'data': exc.detail})
        return attrs

    def _is_partial_block_update(self):
        initial_data = getattr(self, 'initial_data', {}) or {}
        block_id = initial_data.get('id')
        return bool(block_id) and isinstance(block_id, str) and not block_id.startswith('blk_')


class PreviewBlockSerializer(serializers.ModelSerializer):
    """Lightweight block serializer for dashboard preview thumbnails."""
    class Meta:
        model = Block
        fields = ['id', 'type', 'order', 'data']


class PageListSerializer(serializers.ModelSerializer):
    block_count = serializers.IntegerField(source='blocks.count', read_only=True)
    owner_name = serializers.CharField(source='owner.username', read_only=True, default='')
    is_shared = serializers.SerializerMethodField()
    preview_blocks = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            'id', 'name', 'slug', 'status', 'theme_id', 'custom_theme', 'design_tokens',
            'seo_title', 'seo_description', 'seo_canonical_url',
            'og_title', 'og_description', 'og_image', 'og_type', 'noindex',
            'block_count', 'owner_name', 'is_shared', 'preview_blocks',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

    def get_is_shared(self, obj):
        request = self.context.get('request')
        if request and request.user:
            return obj.owner_id != request.user.pk
        return False

    def get_preview_blocks(self, obj):
        prefetched_blocks = getattr(obj, '_prefetched_objects_cache', {}).get('blocks')
        if prefetched_blocks is not None:
            blocks = sorted(prefetched_blocks, key=lambda block: block.order)[:4]
        else:
            blocks = obj.blocks.order_by('order')[:4]
        return PreviewBlockSerializer(blocks, many=True).data


class PageDetailSerializer(serializers.ModelSerializer):
    blocks = BlockSerializer(many=True)

    class Meta:
        model = Page
        fields = [
            'id', 'name', 'slug', 'status', 'theme_id', 'custom_theme', 'design_tokens',
            'seo_title', 'seo_description', 'seo_canonical_url',
            'og_title', 'og_description', 'og_image', 'og_type', 'noindex',
            'blocks', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

    def create(self, validated_data):
        blocks_data = validated_data.pop('blocks', [])
        page = Page.objects.create(**validated_data)
        for i, block_data in enumerate(blocks_data):
            block_data.setdefault('order', i)
            # Remove id from block data — let DB generate UUIDs
            block_data.pop('id', None)
            Block.objects.create(page=page, **block_data)
        return page

    def update(self, instance, validated_data):
        with transaction.atomic():
            blocks_data = validated_data.pop('blocks', None)

            # Auto-snapshot before publishing
            new_status = validated_data.get('status')
            status_changed = new_status and new_status != instance.status
            if (
                new_status == Page.Status.PUBLISHED
                and instance.status != Page.Status.PUBLISHED
                and instance.blocks.exists()
            ):
                from .models import create_version_snapshot
                request = self.context.get('request')
                user = request.user if request else None
                create_version_snapshot(
                    page=instance,
                    user=user,
                    trigger='auto_publish',
                    label='Antes de publicar',
                )

            # Invalidate sitemap cache when publish status changes
            if status_changed:
                try:
                    from django.core.cache import cache
                    cache.delete('sitemap_xml')
                except Exception:
                    pass

            # Update page fields
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            # If blocks were provided, replace them all (full sync from frontend)
            if blocks_data is not None:
                # Convert to strings for reliable comparison (UUID vs str mismatch)
                existing_ids = {str(uid) for uid in instance.blocks.values_list('id', flat=True)}
                incoming_ids = set()

                for i, block_data in enumerate(blocks_data):
                    block_data.setdefault('order', i)
                    block_id = str(block_data.get('id', '')) if block_data.get('id') else ''

                    if block_id and block_id in existing_ids:
                        # Update existing block
                        block = instance.blocks.get(id=block_id)
                        for attr, value in block_data.items():
                            if attr != 'id':
                                if attr == 'data' and isinstance(value, dict):
                                    value = {**block.data, **value}
                                setattr(block, attr, value)
                        block.save()
                        incoming_ids.add(block_id)
                    else:
                        # Create new block (remove invalid IDs like "blk_xxx")
                        block_data.pop('id', None)
                        new_block = Block.objects.create(page=instance, **block_data)
                        incoming_ids.add(str(new_block.id))

                # Delete blocks that were removed
                blocks_to_delete = existing_ids - incoming_ids
                if blocks_to_delete:
                    instance.blocks.filter(id__in=blocks_to_delete).delete()

                # Clear prefetch cache so the response reflects current blocks
                if hasattr(instance, '_prefetched_objects_cache'):
                    instance._prefetched_objects_cache.pop('blocks', None)

            return instance


class PageVersionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for version listing — excludes snapshot."""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default='')

    class Meta:
        model = PageVersion
        fields = [
            'id', 'version_number', 'trigger', 'label',
            'created_by', 'created_by_name', 'size_bytes', 'created_at',
        ]
        read_only_fields = fields


class PageVersionDetailSerializer(serializers.ModelSerializer):
    """Full serializer including snapshot and page_metadata."""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default='')

    class Meta:
        model = PageVersion
        fields = [
            'id', 'version_number', 'trigger', 'label',
            'created_by', 'created_by_name', 'size_bytes',
            'snapshot', 'page_metadata', 'created_at',
        ]
        read_only_fields = fields


class SharePageSerializer(serializers.Serializer):
    email = serializers.EmailField()


class UnsharePageSerializer(serializers.Serializer):
    user_id = serializers.CharField(trim_whitespace=True)


class VersionLabelSerializer(serializers.Serializer):
    label = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
    )


# --- Domain validation ---

DOMAIN_RE = re.compile(
    r'^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*\.[a-zA-Z]{2,}$'
)
SYSTEM_DOMAINS = {'builderpro.com', 'www.builderpro.com', 'app.builderpro.com', 'api.builderpro.com'}


class CustomDomainSerializer(serializers.ModelSerializer):
    page_name = serializers.CharField(source='page.name', read_only=True, default='')
    dns_instructions = serializers.SerializerMethodField()

    class Meta:
        model = CustomDomain
        fields = [
            'id', 'domain', 'page', 'page_name',
            'dns_status', 'dns_verified_at',
            'ssl_status', 'ssl_provisioned_at', 'ssl_expires_at',
            'last_dns_check_at', 'is_active',
            'dns_instructions',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'dns_status', 'dns_verified_at',
            'ssl_status', 'ssl_provisioned_at', 'ssl_expires_at',
            'last_dns_check_at', 'is_active',
            'dns_instructions',
            'created_at', 'updated_at',
        ]

    def get_dns_instructions(self, obj):
        return {
            'cname': {
                'type': 'CNAME',
                'name': obj.domain.split('.')[0] if '.' in obj.domain else '@',
                'value': 'domains.builderpro.com',
                'ttl': 3600,
            },
            'alternative_a_record': {
                'type': 'A',
                'name': '@',
                'value': '76.223.0.1',  # Placeholder — replace with real IP in production
            },
        }

    def validate_domain(self, value):
        value = value.strip().lower()
        if not DOMAIN_RE.match(value):
            raise serializers.ValidationError('Formato de dominio inválido.')
        if value in SYSTEM_DOMAINS or value.endswith('.builderpro.com'):
            raise serializers.ValidationError('No puedes usar un dominio del sistema.')
        # Check uniqueness (handled by model unique but give better error)
        existing = CustomDomain.objects.filter(domain=value)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('Este dominio ya está registrado.')
        return value

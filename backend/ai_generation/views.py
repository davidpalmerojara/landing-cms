import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from pages.models import Page, Block
from .models import AIGenerationLog
from .prompts import get_system_prompt, get_user_message, get_edit_block_system_prompt, get_edit_block_user_message
from .providers import resolve_provider, call_ai
from .serializers import GeneratePageSerializer, EditBlockSerializer
from .validators import (
    parse_blocks_json,
    validate_blocks,
    sanitize_blocks,
    BlockValidationError,
)

logger = logging.getLogger(__name__)

# Cost estimates per 1M tokens
COST_TABLE = {
    'anthropic': {'input': Decimal('3.00'), 'output': Decimal('15.00')},
    'gemini': {'input': Decimal('0.0'), 'output': Decimal('0.0')},  # Free tier
}

def _check_rate_limit(user) -> str | None:
    """Returns error message if rate limited, None otherwise. Uses plan-based limits."""
    from billing.permissions import get_user_plan

    plan = get_user_plan(user)
    max_generations = plan.max_ai_generations_per_hour

    if max_generations == 0:
        return (
            'La generación con IA está disponible en el plan Pro. '
            'Actualiza para desbloquear esta funcionalidad.'
        )
    if max_generations == -1:
        return None  # unlimited

    one_hour_ago = timezone.now() - timedelta(hours=1)
    recent_count = AIGenerationLog.objects.filter(
        user=user,
        created_at__gte=one_hour_ago,
    ).count()
    if recent_count >= max_generations:
        return f'Has alcanzado el límite de {max_generations} generaciones por hora. Inténtalo más tarde.'
    return None


def _calculate_cost(tokens_in: int, tokens_out: int, provider: str) -> Decimal:
    costs = COST_TABLE.get(provider, COST_TABLE['anthropic'])
    return (Decimal(tokens_in) / Decimal('1000000') * costs['input'] +
            Decimal(tokens_out) / Decimal('1000000') * costs['output'])


class GeneratePageView(APIView):
    """POST /api/pages/{page_id}/generate/ — generate blocks with AI."""

    def post(self, request, page_id):
        # 1. Validate page access
        try:
            page = Page.objects.filter(
                Q(owner=request.user) | Q(collaborators=request.user)
            ).distinct().get(pk=page_id)
        except Page.DoesNotExist:
            return Response(
                {'error': 'Página no encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        input_serializer = GeneratePageSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        prompt = input_serializer.validated_data['prompt']
        tone = input_serializer.validated_data.get('tone', '')
        language = input_serializer.validated_data['language']

        # 3. Rate limit
        rate_error = _check_rate_limit(request.user)
        if rate_error:
            return Response(
                {'error': rate_error},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # 4. Resolve AI provider (user key > server key)
        try:
            provider, api_key = resolve_provider(request.user)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 5. Build prompts
        system_prompt = get_system_prompt()
        user_message = get_user_message(prompt, tone=tone, language=language)

        # 6. Call AI (with 1 retry on validation failure)
        total_tokens_in = 0
        total_tokens_out = 0
        last_error = None

        for attempt in range(2):
            try:
                ai_response = call_ai(system_prompt, user_message, provider, api_key)
                total_tokens_in += ai_response.tokens_in
                total_tokens_out += ai_response.tokens_out
            except Exception as e:
                logger.error(f'AI API error ({provider}): {e}')
                AIGenerationLog.objects.create(
                    user=request.user,
                    page=page,
                    prompt=prompt,
                    mode=AIGenerationLog.Mode.FULL_PAGE,
                    tokens_in=total_tokens_in,
                    tokens_out=total_tokens_out,
                    cost_estimate=_calculate_cost(total_tokens_in, total_tokens_out, provider),
                )
                error_msg = str(e)
                # Give a helpful message if it's an auth error
                if 'auth' in error_msg.lower() or 'key' in error_msg.lower() or '401' in error_msg or '403' in error_msg:
                    return Response(
                        {'error': f'API key inválida para {provider}. Verifica tu clave en Configuración > IA.'},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )
                return Response(
                    {'error': 'Error al comunicarse con el servicio de IA. Intenta de nuevo o usa una plantilla.'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            # Parse and validate
            try:
                blocks_data = parse_blocks_json(ai_response.text)
                errors = validate_blocks(blocks_data)
                if errors:
                    raise BlockValidationError(errors)
                last_error = None
                break
            except BlockValidationError as e:
                last_error = e
                if attempt == 0:
                    user_message = (
                        f'{user_message}\n\n'
                        f'IMPORTANT: Your previous response had validation errors:\n'
                        f'{chr(10).join(e.errors)}\n\n'
                        f'Please fix these errors and respond with a valid JSON array.'
                    )
                    logger.warning(f'AI generation retry ({provider}): {e.errors}')

        if last_error:
            AIGenerationLog.objects.create(
                user=request.user,
                page=page,
                prompt=prompt,
                mode=AIGenerationLog.Mode.FULL_PAGE,
                tokens_in=total_tokens_in,
                tokens_out=total_tokens_out,
                cost_estimate=_calculate_cost(total_tokens_in, total_tokens_out, provider),
            )
            return Response(
                {
                    'error': 'La IA generó contenido inválido tras 2 intentos. Prueba con otra descripción o usa una plantilla.',
                    'details': last_error.errors[:5],
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # 7. Sanitize and persist blocks
        sanitized = sanitize_blocks(blocks_data)

        # Auto-snapshot before AI replaces all blocks
        if page.blocks.exists():
            from pages.models import create_version_snapshot
            create_version_snapshot(
                page=page,
                user=request.user,
                trigger='auto_ai_generation',
                label='Antes de generación IA',
            )

        page.blocks.all().delete()

        created_blocks = []
        for i, block_data in enumerate(sanitized):
            block = Block.objects.create(
                page=page,
                type=block_data['type'],
                order=i,
                data=block_data['data'],
                styles={},
            )
            created_blocks.append({
                'id': str(block.id),
                'type': block.type,
                'order': block.order,
                'data': block.data,
                'styles': block.styles,
            })

        # 8. Log usage
        cost = _calculate_cost(total_tokens_in, total_tokens_out, provider)
        AIGenerationLog.objects.create(
            user=request.user,
            page=page,
            prompt=prompt,
            mode=AIGenerationLog.Mode.FULL_PAGE,
            tokens_in=total_tokens_in,
            tokens_out=total_tokens_out,
            cost_estimate=cost,
        )

        logger.info(
            f'AI generation: user={request.user.username} page={page.pk} '
            f'provider={provider} blocks={len(created_blocks)} '
            f'tokens_in={total_tokens_in} tokens_out={total_tokens_out} cost=${cost}'
        )

        return Response({
            'page_id': str(page.pk),
            'block_count': len(created_blocks),
            'blocks': created_blocks,
            'provider': provider,
            'tokens': {
                'input': total_tokens_in,
                'output': total_tokens_out,
                'cost_estimate': str(cost),
            },
        }, status=status.HTTP_200_OK)


class EditBlockView(APIView):
    """POST /api/pages/{page_id}/blocks/{block_id}/edit-ai/ — edit a single block with AI."""

    def post(self, request, page_id, block_id):
        # 1. Validate page access
        try:
            page = Page.objects.filter(
                Q(owner=request.user) | Q(collaborators=request.user)
            ).distinct().get(pk=page_id)
        except Page.DoesNotExist:
            return Response(
                {'error': 'Página no encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 2. Find block
        try:
            block = page.blocks.get(pk=block_id)
        except Block.DoesNotExist:
            return Response(
                {'error': 'Bloque no encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        input_serializer = EditBlockSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        instruction = input_serializer.validated_data['instruction']

        # 4. Rate limit
        rate_error = _check_rate_limit(request.user)
        if rate_error:
            return Response(
                {'error': rate_error},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # 5. Resolve provider
        try:
            provider, api_key = resolve_provider(request.user)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 6. Build prompts
        system_prompt = get_edit_block_system_prompt()
        user_message = get_edit_block_user_message(block.type, block.data, instruction)

        # 7. Call AI
        try:
            ai_response = call_ai(system_prompt, user_message, provider, api_key)
        except Exception as e:
            logger.error(f'AI edit block error ({provider}): {e}')
            AIGenerationLog.objects.create(
                user=request.user,
                page=page,
                prompt=instruction,
                mode=AIGenerationLog.Mode.EDIT_BLOCK,
                tokens_in=0,
                tokens_out=0,
                cost_estimate=Decimal('0'),
            )
            return Response(
                {'error': 'Error al comunicarse con el servicio de IA.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 8. Parse and validate single block
        import json
        try:
            text = ai_response.text.strip()
            # Strip code fences
            if text.startswith('```'):
                lines = text.split('\n')
                lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                text = '\n'.join(lines).strip()

            result = json.loads(text)
            if not isinstance(result, dict) or 'type' not in result or 'data' not in result:
                raise ValueError('Invalid block structure')

            # Validate using existing validators
            errors = validate_blocks([result])
            if errors:
                raise BlockValidationError(errors)

            sanitized = sanitize_blocks([result])
            if not sanitized:
                raise ValueError('Block sanitization failed')

            new_block_data = sanitized[0]
        except (json.JSONDecodeError, ValueError, BlockValidationError) as e:
            logger.warning(f'AI edit block validation error: {e}')
            return Response(
                {'error': 'La IA generó una respuesta inválida. Intenta con otra instrucción.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # 9. Auto-snapshot before AI edits block
        from pages.models import create_version_snapshot
        create_version_snapshot(
            page=page,
            user=request.user,
            trigger='auto_ai_generation',
            label=f'Antes de editar bloque {block.type} con IA',
        )

        # 10. Update block in DB
        block.type = new_block_data['type']
        block.data = new_block_data['data']
        block.save()

        # 10. Log usage
        cost = _calculate_cost(ai_response.tokens_in, ai_response.tokens_out, provider)
        AIGenerationLog.objects.create(
            user=request.user,
            page=page,
            prompt=instruction,
            mode=AIGenerationLog.Mode.EDIT_BLOCK,
            tokens_in=ai_response.tokens_in,
            tokens_out=ai_response.tokens_out,
            cost_estimate=cost,
        )

        logger.info(
            f'AI edit block: user={request.user.username} page={page.pk} block={block.pk} '
            f'provider={provider} tokens_in={ai_response.tokens_in} tokens_out={ai_response.tokens_out}'
        )

        return Response({
            'block': {
                'id': str(block.pk),
                'type': block.type,
                'order': block.order,
                'data': block.data,
                'styles': block.styles,
            },
            'provider': provider,
            'tokens': {
                'input': ai_response.tokens_in,
                'output': ai_response.tokens_out,
                'cost_estimate': str(cost),
            },
        }, status=status.HTTP_200_OK)

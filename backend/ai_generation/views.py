import copy
import json
import logging
import time
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.translation import get_language
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from collaboration.locks import get_lock_manager
from pages import sync
from pages.models import Page, Block, create_version_snapshot, lock_page, pages_accessible_to
from pages.permissions import require_page_owner
from . import demo, providers
from .merge import merge_block_data
from .models import AIGenerationLog
from .pipeline import generate_blocks, InvalidOutputError, ProviderCallError
from .prompts import get_edit_block_system_prompt, get_edit_block_user_message
from .providers import resolve_provider, ProviderQuotaError
from .serializers import GeneratePageSerializer, EditBlockSerializer, OptionsQuerySerializer
from .validators import validate_blocks, finalize_blocks, BlockValidationError

logger = logging.getLogger(__name__)

Source = AIGenerationLog.Source

# Why a saved response was served (the frontend words the label from this)
REASON_DEMO_MODE = 'demo_mode'
REASON_DAILY_LIMIT = 'daily_limit'
REASON_PROVIDER_QUOTA = 'provider_quota'

# Cost estimates per 1M tokens
COST_TABLE = {
    'anthropic': {'input': Decimal('3.00'), 'output': Decimal('15.00')},
    'gemini': {'input': Decimal('0.0'), 'output': Decimal('0.0')},  # Free tier
}
NO_COST = Decimal('0')


@dataclass(frozen=True)
class Route:
    """Where an AI request is answered from."""
    source: str
    provider: str = ''
    api_key: str = ''
    reason: str = REASON_DEMO_MODE  # only meaningful for Source.DEMO


def _error(message: str, code: str, http_status: int, **extra) -> Response:
    return Response({'error': message, 'code': code, **extra}, status=http_status)


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
        source=Source.LIVE,
    ).count()
    if recent_count >= max_generations:
        return f'Has alcanzado el límite de {max_generations} generaciones por hora. Inténtalo más tarde.'
    return None


def _live_cap_reached(user) -> bool:
    """True when today's (UTC) calls with the server key reached the global or the per-user limit."""
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    live_today = AIGenerationLog.objects.filter(source=Source.LIVE, created_at__gte=today)
    return (
        live_today.count() >= settings.AI_LIVE_DAILY_LIMIT
        or live_today.filter(user=user).count() >= settings.AI_LIVE_USER_DAILY_LIMIT
    )


def _calculate_cost(tokens_in: int, tokens_out: int, provider: str) -> Decimal:
    costs = COST_TABLE.get(provider, COST_TABLE['anthropic'])
    return (Decimal(tokens_in) / Decimal('1000000') * costs['input'] +
            Decimal(tokens_out) / Decimal('1000000') * costs['output'])


def choose_route(user, data: dict) -> Route | Response:
    """Decide how a request is answered, in this order:

    1. A key sent with the request: call that provider. No plan check: it is not our quota.
    2. Demo mode (the default): a saved response, never the server key.
    3. The server key, subject to the plan and the daily caps. Past a cap, a saved response.
    """
    own_provider = data.get('provider')
    own_key = data.get('api_key')
    if own_provider and own_key:
        return Route(Source.OWN_KEY, own_provider, own_key)

    if settings.AI_DEMO_MODE:
        return Route(Source.DEMO)

    try:
        provider, api_key, _ = resolve_provider(own_provider, own_key)
    except ValueError as exc:
        return _error(str(exc), 'AI_NOT_CONFIGURED', status.HTTP_400_BAD_REQUEST)

    rate_error = _check_rate_limit(user)
    if rate_error:
        return _error(rate_error, 'AI_PLAN_LIMIT', status.HTTP_429_TOO_MANY_REQUESTS)

    if _live_cap_reached(user):
        return Route(Source.DEMO, reason=REASON_DAILY_LIMIT)
    return Route(Source.LIVE, provider, api_key)


def _fall_back_to_demo(route: Route, error: ProviderQuotaError) -> Route | Response:
    """The provider has no quota left. With the server key that means a saved response;
    with the user's own key the user has to know it is their key's quota."""
    if route.source == Source.OWN_KEY:
        logger.warning('AI quota exhausted for a user key (%s)', route.provider)
        return _error(
            f'Tu clave de {route.provider} ha agotado su cuota. Prueba más tarde o con otra clave.',
            'AI_KEY_QUOTA',
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
    logger.warning('AI quota exhausted for the server key (%s): %s', route.provider, error)
    return Route(Source.DEMO, reason=REASON_PROVIDER_QUOTA)


def _wait_like_a_call() -> None:
    """A saved response arrives after a short wait, like a generated one would."""
    delay = settings.AI_DEMO_DELAY_SECONDS
    if delay > 0:
        time.sleep(delay)


def _log(user, page, route: Route, mode: str, prompt: str, tokens_in: int = 0, tokens_out: int = 0) -> Decimal:
    """Record one request. A saved response costs nothing and counts toward no limit."""
    cost = NO_COST if route.source == Source.DEMO else _calculate_cost(tokens_in, tokens_out, route.provider)
    AIGenerationLog.objects.create(
        user=user,
        source=route.source,
        page=page,
        prompt=prompt,
        mode=mode,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_estimate=cost,
    )
    return cost


def _provider_error_response(route: Route, error: Exception) -> Response:
    message = str(error).lower()
    if route.source == Source.OWN_KEY and ('auth' in message or 'key' in message or '401' in message or '403' in message):
        return _error(
            f'API key inválida para {route.provider}. Verifica tu clave en Configuración > IA.',
            'AI_INVALID_KEY',
            status.HTTP_401_UNAUTHORIZED,
        )
    return _error(
        'Error al comunicarse con el servicio de IA. Intenta de nuevo o usa una plantilla.',
        'AI_PROVIDER_ERROR',
        status.HTTP_502_BAD_GATEWAY,
    )


def _demo_details(route: Route, fixture_id: str | None = None, matched: bool | None = None) -> dict:
    details: dict = {'reason': route.reason, 'origin': demo.fixtures_origin()}
    if fixture_id is not None:
        details['fixture_id'] = fixture_id
        details['matched'] = matched
    return details


def _source_fields(route: Route, **demo_extra) -> dict:
    fields: dict = {'source': route.source, 'provider': route.provider or None}
    if route.source == Source.DEMO:
        fields['demo'] = _demo_details(route, **demo_extra)
    return fields


class AIOptionsView(APIView):
    """GET /api/ai/options/?language=es — how AI answers right now and the suggested prompts."""

    def get(self, request):
        query = OptionsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        language = query.validated_data['language']

        if settings.AI_DEMO_MODE:
            mode = 'demo'
        elif settings.GOOGLE_AI_KEY or settings.ANTHROPIC_API_KEY:
            mode = 'live'
        else:
            mode = 'unavailable'

        return Response({
            'mode': mode,
            'live_user_daily_limit': settings.AI_LIVE_USER_DAILY_LIMIT,
            'prompts': demo.list_prompts(language),
        })


def _get_page(user, page_id) -> Page | None:
    return pages_accessible_to(user).filter(pk=page_id).first()


def _replace_page_blocks(page: Page, user, sanitized: list[dict]) -> list[dict]:
    """Snapshot the page, then replace its blocks with the validated ones, all or
    nothing and one request at a time per page: two generations at once used to
    interleave their blocks and collide on the version number."""
    with transaction.atomic():
        lock_page(page.pk)
        created = _replace_page_blocks_locked(page, user, sanitized)
        sync.bump_version(page)
    return created


def _replace_page_blocks_locked(page: Page, user, sanitized: list[dict]) -> list[dict]:
    # Auto-snapshot before AI replaces all blocks
    if page.blocks.exists():
        create_version_snapshot(
            page=page,
            user=user,
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
    return created_blocks


class GeneratePageView(APIView):
    """POST /api/pages/{page_id}/generate/ — generate blocks with AI. Owner only:
    it replaces every block of the page (ADR-032)."""

    def post(self, request, page_id):
        page = _get_page(request.user, page_id)
        if page is None:
            return _error('Página no encontrada.', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)
        require_page_owner(page, request.user, 'Solo el propietario puede regenerar la página entera con IA.')

        input_serializer = GeneratePageSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        prompt = input_serializer.validated_data['prompt']
        tone = input_serializer.validated_data.get('tone', '')
        language = input_serializer.validated_data['language']

        route = choose_route(request.user, input_serializer.validated_data)
        if isinstance(route, Response):
            return route

        tokens_in = 0
        tokens_out = 0
        demo_extra: dict = {}
        sanitized: list[dict] | None = None

        if route.source != Source.DEMO:
            outcome = self._generate_with_provider(request.user, page, route, prompt, tone, language)
            if isinstance(outcome, Response):
                return outcome
            if isinstance(outcome, Route):
                route = outcome  # the provider had no quota left: serve a saved page
            else:
                sanitized, tokens_in, tokens_out = outcome

        if sanitized is None:
            _wait_like_a_call()
            match = demo.match_fixture(prompt, language)
            try:
                sanitized = finalize_blocks(list(match.fixture.blocks))
            except BlockValidationError as exc:
                logger.error('Saved demo page %s no longer passes validation: %s', match.fixture.id, exc.errors)
                return _error('No se pudo cargar la página de demo.', 'DEMO_FIXTURE_INVALID',
                              status.HTTP_500_INTERNAL_SERVER_ERROR)
            demo_extra = {'fixture_id': match.fixture.id, 'matched': match.matched}

        created_blocks = _replace_page_blocks(page, request.user, sanitized)
        sync.notify_page_updated(page, sync.REASON_AI, request.user, sync.connection_id_from(request))
        cost = _log(request.user, page, route, AIGenerationLog.Mode.FULL_PAGE, prompt, tokens_in, tokens_out)

        logger.info(
            'AI generation: user=%s page=%s source=%s provider=%s blocks=%d tokens_in=%d tokens_out=%d cost=$%s',
            request.user.username, page.pk, route.source, route.provider or '-', len(created_blocks),
            tokens_in, tokens_out, cost,
        )

        return Response({
            'page_id': str(page.pk),
            'version': page.version,
            'block_count': len(created_blocks),
            'blocks': created_blocks,
            **_source_fields(route, **demo_extra),
            'tokens': {
                'input': tokens_in,
                'output': tokens_out,
                'cost_estimate': str(cost),
            },
        }, status=status.HTTP_200_OK)

    def _generate_with_provider(self, user, page, route: Route, prompt: str, tone: str, language: str):
        """Returns (sanitized blocks, tokens_in, tokens_out), a Response to send back as an
        error, or a demo Route when the server key's quota is exhausted."""
        try:
            generated = generate_blocks(prompt, tone, language, route.provider, route.api_key)
        except ProviderQuotaError as exc:
            return _fall_back_to_demo(route, exc)
        except ProviderCallError as exc:
            logger.error('AI API error (%s): %s', route.provider, exc.cause)
            _log(user, page, route, AIGenerationLog.Mode.FULL_PAGE, prompt, exc.tokens_in, exc.tokens_out)
            return _provider_error_response(route, exc.cause)
        except InvalidOutputError as exc:
            _log(user, page, route, AIGenerationLog.Mode.FULL_PAGE, prompt, exc.tokens_in, exc.tokens_out)
            return Response(
                {
                    'error': 'La IA generó contenido inválido tras 2 intentos. Prueba con otra descripción o usa una plantilla.',
                    'code': 'AI_INVALID_OUTPUT',
                    'details': exc.errors[:5],
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return generated.blocks, generated.tokens_in, generated.tokens_out


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith('```'):
        lines = text.split('\n')[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines).strip()
    return text


def _clean_edit_result(result: dict) -> dict:
    """Validate one block the model returned, like the REST API would (raises BlockValidationError)."""
    errors = validate_blocks([result])
    if errors:
        raise BlockValidationError(errors)
    return finalize_blocks([result])[0]


def _locked_by_another_connection(page_id, block_id, connection_id: str | None) -> bool:
    """Someone else is editing the block right now (the lock holder is a WebSocket
    connection id; the request names its own in X-Connection-Id)."""
    try:
        holder = get_lock_manager().get_lock_holder(str(page_id), str(block_id))
    except Exception:  # noqa: BLE001 - a lock backend outage must not block the edit
        logger.warning('Could not read the lock of block %s on page %s', block_id, page_id, exc_info=True)
        return False
    return holder is not None and holder != connection_id


class EditBlockView(APIView):
    """POST /api/pages/{page_id}/blocks/{block_id}/edit-ai/ — edit a single block with AI.

    The provider call takes seconds, during which someone may save the same
    block: the result is applied only if the block is still as it was when the
    call started, otherwise 409 BLOCK_CHANGED and nothing is written (QA-030).
    """

    def post(self, request, page_id, block_id):
        page = _get_page(request.user, page_id)
        if page is None:
            return _error('Página no encontrada.', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)

        try:
            block = page.blocks.get(pk=block_id)
        except Block.DoesNotExist:
            return _error('Bloque no encontrado.', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)

        input_serializer = EditBlockSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        instruction = input_serializer.validated_data['instruction']

        connection_id = sync.connection_id_from(request)
        if _locked_by_another_connection(page.pk, block.pk, connection_id):
            return _error('Otra persona está editando este bloque.', 'BLOCK_LOCKED', status.HTTP_409_CONFLICT)
        original = (block.type, copy.deepcopy(block.data))

        route = choose_route(request.user, input_serializer.validated_data)
        if isinstance(route, Response):
            return route

        tokens_in = 0
        tokens_out = 0
        new_type = block.type
        new_data: dict | None = None

        if route.source != Source.DEMO:
            outcome = self._edit_with_provider(request.user, page, block, route, instruction)
            if isinstance(outcome, Response):
                return outcome
            if isinstance(outcome, Route):
                route = outcome
            else:
                new_type, new_data, tokens_in, tokens_out = outcome

        if new_data is None:
            _wait_like_a_call()
            # The page's language; for one the demo has no pages in, the interface's (Accept-Language)
            language = demo.demo_language(page.language, get_language())
            variant = demo.pick_variant(block.type, f'{block.pk}:{instruction}', language, exclude=[block.data])
            if variant is None:
                return _error(
                    'La demo no tiene una variante guardada para este tipo de bloque.',
                    'DEMO_NO_VARIANT',
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            try:
                cleaned = _clean_edit_result({'type': block.type, 'data': variant})
            except BlockValidationError as exc:
                logger.error('Saved demo block (%s) no longer passes validation: %s', block.type, exc.errors)
                return _error('No se pudo cargar la variante de demo.', 'DEMO_FIXTURE_INVALID',
                              status.HTTP_500_INTERNAL_SERVER_ERROR)
            new_data = merge_block_data(block.data, variant, cleaned['data'])

        with transaction.atomic():
            lock_page(page.pk)
            current = Block.objects.select_for_update().filter(pk=block.pk, page=page).first()
            if current is None:
                return _error('Bloque no encontrado.', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)
            if (current.type, current.data) != original or _locked_by_another_connection(
                page.pk, block.pk, connection_id,
            ):
                logger.info('AI edit of block %s dropped: it changed while the model answered', block.pk)
                return _error(
                    'El bloque ha cambiado mientras la IA trabajaba. No se ha aplicado nada; inténtalo de nuevo.',
                    'BLOCK_CHANGED',
                    status.HTTP_409_CONFLICT,
                )
            block = current

            # Auto-snapshot before AI edits block
            create_version_snapshot(
                page=page,
                user=request.user,
                trigger='auto_ai_generation',
                label=f'Antes de editar bloque {block.type} con IA',
            )

            block.type = new_type
            block.data = new_data
            block.save()
            sync.bump_version(page)
        sync.notify_page_updated(page, sync.REASON_AI, request.user, connection_id)

        cost = _log(request.user, page, route, AIGenerationLog.Mode.EDIT_BLOCK, instruction, tokens_in, tokens_out)

        logger.info(
            'AI edit block: user=%s page=%s block=%s source=%s provider=%s tokens_in=%d tokens_out=%d',
            request.user.username, page.pk, block.pk, route.source, route.provider or '-', tokens_in, tokens_out,
        )

        return Response({
            'version': page.version,
            # The page version after this write: the editor adopts it, with the block,
            # as its sync base so the next save does not conflict with the AI's own write
            'page_version': page.version,
            'block': {
                'id': str(block.pk),
                'type': block.type,
                'order': block.order,
                'data': block.data,
                'styles': block.styles,
            },
            **_source_fields(route),
            'tokens': {
                'input': tokens_in,
                'output': tokens_out,
                'cost_estimate': str(cost),
            },
        }, status=status.HTTP_200_OK)

    def _edit_with_provider(self, user, page, block, route: Route, instruction: str):
        """Returns (type, data, tokens_in, tokens_out), a Response for an error, or a demo
        Route when the server key's quota is exhausted."""
        system_prompt = get_edit_block_system_prompt()
        user_message = get_edit_block_user_message(block.type, block.data, instruction)

        try:
            ai_response = providers.call_ai(system_prompt, user_message, route.provider, route.api_key)
        except ProviderQuotaError as exc:
            return _fall_back_to_demo(route, exc)
        except Exception as exc:  # noqa: BLE001 - any provider failure is reported the same way
            logger.error('AI edit block error (%s): %s', route.provider, exc)
            _log(user, page, route, AIGenerationLog.Mode.EDIT_BLOCK, instruction)
            return _error('Error al comunicarse con el servicio de IA.', 'AI_PROVIDER_ERROR',
                          status.HTTP_502_BAD_GATEWAY)

        try:
            result = json.loads(_strip_code_fences(ai_response.text))
            if not isinstance(result, dict) or 'type' not in result or 'data' not in result:
                raise ValueError('Invalid block structure')
            cleaned = _clean_edit_result(result)
        except (json.JSONDecodeError, ValueError, BlockValidationError) as exc:
            logger.warning('AI edit block validation error: %s', exc)
            return _error('La IA generó una respuesta inválida. Intenta con otra instrucción.',
                          'AI_INVALID_OUTPUT', status.HTTP_422_UNPROCESSABLE_ENTITY)

        if cleaned['type'] == block.type:
            # The schema covers only part of the block's fields: keep the rest as it is
            data = merge_block_data(block.data, result['data'], cleaned['data'])
        else:
            data = cleaned['data']
        return cleaned['type'], data, ai_response.tokens_in, ai_response.tokens_out

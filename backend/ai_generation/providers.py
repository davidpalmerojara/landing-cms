"""
AI provider abstraction — supports Anthropic Claude and Google Gemini.
Priority: user's own key > server fallback key.
"""

import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)

AI_MODEL_ANTHROPIC = 'claude-sonnet-4-20250514'
AI_MODEL_GEMINI = 'gemini-2.5-flash'
MAX_TOKENS = 4096


@dataclass
class AIResponse:
    text: str
    tokens_in: int
    tokens_out: int
    provider: str  # 'anthropic' or 'gemini'


def resolve_provider(own_provider: str | None = None, own_key: str | None = None) -> tuple[str, str, bool]:
    """Choose provider and key. Returns (provider, api_key, uses_server_key).

    A key sent with the request (the user's own) is used for that call only
    and never stored. Otherwise the server key is used, subject to plan limits.
    """
    if own_provider and own_key:
        return own_provider, own_key, False

    server_gemini = getattr(settings, 'GOOGLE_AI_KEY', '')
    server_anthropic = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if server_gemini:
        return 'gemini', server_gemini, True
    if server_anthropic:
        return 'anthropic', server_anthropic, True

    raise ValueError(
        'No hay una clave de IA disponible. Puedes usar tu propia clave de '
        'Google Gemini o Anthropic: se usa solo para esta petición y no se guarda.'
    )


def call_ai(system_prompt: str, user_message: str, provider: str, api_key: str) -> AIResponse:
    """Call the appropriate AI provider and return the response."""
    if provider == 'anthropic':
        return _call_anthropic(system_prompt, user_message, api_key)
    elif provider == 'gemini':
        return _call_gemini(system_prompt, user_message, api_key)
    else:
        raise ValueError(f'Proveedor de IA no soportado: {provider}')


def _call_anthropic(system_prompt: str, user_message: str, api_key: str) -> AIResponse:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=AI_MODEL_ANTHROPIC,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=[{'role': 'user', 'content': user_message}],
    )

    text = message.content[0].text if message.content else ''
    return AIResponse(
        text=text,
        tokens_in=message.usage.input_tokens,
        tokens_out=message.usage.output_tokens,
        provider='anthropic',
    )


def _call_gemini(system_prompt: str, user_message: str, api_key: str) -> AIResponse:
    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=AI_MODEL_GEMINI,
        contents=user_message,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=MAX_TOKENS,
            temperature=0.7,
        ),
    )

    text = response.text or ''
    # Gemini usage metadata
    tokens_in = 0
    tokens_out = 0
    if response.usage_metadata:
        tokens_in = response.usage_metadata.prompt_token_count or 0
        tokens_out = response.usage_metadata.candidates_token_count or 0

    return AIResponse(
        text=text,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        provider='gemini',
    )

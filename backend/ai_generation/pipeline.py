"""
The page generation pipeline: system prompt, user message, provider call, parsing
and validation, with one retry when the output is invalid.

The generate view and the generate_ai_fixtures command both use it, so the saved
demo pages come out of exactly the code that serves real generations.
"""

import logging
from dataclasses import dataclass
from typing import Callable

from . import providers
from .prompts import get_system_prompt, get_user_message
from .providers import ProviderQuotaError
from .validators import BlockValidationError, finalize_blocks, parse_blocks_json, validate_blocks

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 2


@dataclass(frozen=True)
class GeneratedBlocks:
    blocks: list[dict]  # validated and cleaned, ready to save
    tokens_in: int
    tokens_out: int


class ProviderCallError(Exception):
    """The provider call failed (not for lack of quota). Carries the tokens spent so far."""

    def __init__(self, cause: Exception, tokens_in: int, tokens_out: int):
        self.cause = cause
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out
        super().__init__(str(cause))


class InvalidOutputError(Exception):
    """The model's output failed validation on every attempt."""

    def __init__(self, errors: list[str], tokens_in: int, tokens_out: int):
        self.errors = errors
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out
        super().__init__('; '.join(errors))


def generate_blocks(
    prompt: str,
    tone: str,
    language: str,
    provider: str,
    api_key: str,
    *,
    call: Callable | None = None,
    max_attempts: int = MAX_ATTEMPTS,
) -> GeneratedBlocks:
    """Generate and validate the blocks of a page.

    Raises ProviderQuotaError (the provider's quota is used up), ProviderCallError
    (any other provider failure) or InvalidOutputError (invalid after max_attempts).
    """
    call_provider = call or providers.call_ai
    system_prompt = get_system_prompt()
    user_message = get_user_message(prompt, tone=tone, language=language)
    tokens_in = 0
    tokens_out = 0
    last_error: BlockValidationError | None = None

    for attempt in range(max_attempts):
        try:
            response = call_provider(system_prompt, user_message, provider, api_key)
        except ProviderQuotaError:
            raise
        except Exception as exc:  # noqa: BLE001 - any provider failure is reported the same way
            raise ProviderCallError(exc, tokens_in, tokens_out) from exc
        tokens_in += response.tokens_in
        tokens_out += response.tokens_out

        try:
            blocks_data = parse_blocks_json(response.text)
            errors = validate_blocks(blocks_data)
            if errors:
                raise BlockValidationError(errors)
            # Same validation as the REST API; failing it also retries
            return GeneratedBlocks(finalize_blocks(blocks_data), tokens_in, tokens_out)
        except BlockValidationError as exc:
            last_error = exc
            if attempt < max_attempts - 1:
                user_message = (
                    f'{user_message}\n\n'
                    f'IMPORTANT: Your previous response had validation errors:\n'
                    f'{chr(10).join(exc.errors)}\n\n'
                    f'Please fix these errors and respond with a valid JSON array.'
                )
                logger.warning('AI generation retry (%s): %s', provider, exc.errors)

    raise InvalidOutputError(last_error.errors if last_error else ['No attempt was made.'], tokens_in, tokens_out)

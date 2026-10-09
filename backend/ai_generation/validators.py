"""
Validates AI-generated block JSON against the block schemas.
"""

import json

from rest_framework.exceptions import ValidationError as DRFValidationError

from pages.block_validators import clean_block_data

from .block_schemas import BLOCK_SCHEMAS, VALID_BLOCK_TYPES


class BlockValidationError(Exception):
    """Raised when generated blocks fail validation."""
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"Block validation failed: {'; '.join(errors)}")


def parse_blocks_json(raw: str) -> list[dict]:
    """Parse raw LLM output into a list of block dicts.
    Handles cases where the LLM wraps JSON in markdown code fences.
    """
    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith('```'):
        lines = text.split('\n')
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line (```)
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise BlockValidationError([f"Invalid JSON: {e}"])

    if not isinstance(parsed, list):
        raise BlockValidationError(["Response must be a JSON array of blocks."])

    return parsed


def _validate_field(errors: list[str], where: str, name: str, spec: dict, value) -> None:
    """Append to `errors` what is wrong with one field value (recursing into list items)."""
    expected_type = spec['type']

    if expected_type == 'list':
        if value is None:
            if spec.get('required'):
                errors.append(f"{where}: required field '{name}' is missing.")
            return
        if not isinstance(value, list):
            errors.append(f"{where}: '{name}' must be a list, got {type(value).__name__}.")
            return
        if len(value) < spec['min_items'] or len(value) > spec['max_items']:
            errors.append(
                f"{where}: '{name}' must have {spec['min_items']} to {spec['max_items']} items, got {len(value)}."
            )
            return
        for index, item in enumerate(value):
            item_where = f"{where}, {name}[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{item_where}: must be an object, got {type(item).__name__}.")
                continue
            for item_name, item_spec in spec['items'].items():
                _validate_field(errors, item_where, item_name, item_spec, item.get(item_name))
        return

    if spec.get('required') and (value is None or value == ''):
        errors.append(f"{where}: required field '{name}' is missing or empty.")
        return

    if value is None:
        return

    if expected_type == 'string' and not isinstance(value, str):
        errors.append(f"{where}: '{name}' must be a string, got {type(value).__name__}.")
        return

    if expected_type == 'boolean' and not isinstance(value, bool):
        errors.append(f"{where}: '{name}' must be a boolean, got {type(value).__name__}.")
        return

    if isinstance(value, str) and 'max_length' in spec and len(value) > spec['max_length']:
        errors.append(f"{where}: '{name}' exceeds max length ({len(value)} > {spec['max_length']}).")

    if isinstance(value, str) and 'options' in spec and value not in spec['options']:
        errors.append(f"{where}: '{name}' must be one of {spec['options']}, got '{value}'.")


def validate_blocks(blocks: list[dict]) -> list[str]:
    """Validate a list of block dicts against the schemas.
    Returns a list of error messages (empty = valid).
    """
    errors = []

    if not blocks:
        errors.append("No blocks generated.")
        return errors

    if len(blocks) > 20:
        errors.append(f"Too many blocks ({len(blocks)}). Maximum is 20.")
        return errors

    for i, block in enumerate(blocks):
        prefix = f"Block {i}"

        if not isinstance(block, dict):
            errors.append(f"{prefix}: must be an object, got {type(block).__name__}.")
            continue

        btype = block.get('type')
        if not btype:
            errors.append(f"{prefix}: missing 'type' field.")
            continue

        if btype not in VALID_BLOCK_TYPES:
            errors.append(f"{prefix}: unknown type '{btype}'. Valid: {sorted(VALID_BLOCK_TYPES)}.")
            continue

        data = block.get('data')
        if not isinstance(data, dict):
            errors.append(f"{prefix} ({btype}): missing or invalid 'data' field.")
            continue

        for field_name, field_spec in BLOCK_SCHEMAS[btype]['fields'].items():
            _validate_field(errors, f"{prefix} ({btype})", field_name, field_spec, data.get(field_name))

    return errors


def _default_for(spec: dict):
    if 'default' in spec:
        return spec['default']
    if spec['type'] == 'list':
        return []
    return '' if spec['type'] == 'string' else False


def _sanitize_field(spec: dict, value):
    """Defaults for empty values, strings cut to max_length, unknown item keys removed."""
    if spec['type'] == 'list':
        if not isinstance(value, list):
            return _default_for(spec)
        return [
            {name: _sanitize_field(item_spec, item.get(name)) for name, item_spec in spec['items'].items()}
            for item in value[:spec['max_items']]
            if isinstance(item, dict)
        ]
    if value is None or (isinstance(value, str) and value == '' and not spec.get('required')):
        return _default_for(spec)
    if isinstance(value, str) and 'max_length' in spec:
        return value[:spec['max_length']]
    return value


def sanitize_blocks(blocks: list[dict]) -> list[dict]:
    """Fill in defaults for optional fields and strip unknown fields."""
    sanitized = []

    for block in blocks:
        btype = block.get('type')
        if btype not in VALID_BLOCK_TYPES:
            continue

        data = block.get('data', {})
        sanitized.append({
            'type': btype,
            'data': {
                field_name: _sanitize_field(field_spec, data.get(field_name))
                for field_name, field_spec in BLOCK_SCHEMAS[btype]['fields'].items()
            },
        })

    return sanitized


def _flatten_errors(detail) -> str:
    if isinstance(detail, dict):
        return '; '.join(f"{key}: {_flatten_errors(value)}" for key, value in detail.items())
    if isinstance(detail, list):
        return ' '.join(_flatten_errors(item) for item in detail)
    return str(detail)


def finalize_blocks(blocks: list[dict]) -> list[dict]:
    """Turn model output that passed validate_blocks into what gets saved:
    defaults and truncation first, then the same validation as the REST API
    (pages.block_validators.clean_block_data: sanitizing, link and URL checks,
    limits). Raises BlockValidationError if the editor's rules reject it."""
    cleaned = []
    errors = []
    for index, block in enumerate(sanitize_blocks(blocks)):
        try:
            data = clean_block_data(block['type'], block['data'])
        except DRFValidationError as exc:
            errors.append(f"Block {index} ({block['type']}): {_flatten_errors(exc.detail)}")
            continue
        cleaned.append({'type': block['type'], 'data': data})
    if errors:
        raise BlockValidationError(errors)
    return cleaned

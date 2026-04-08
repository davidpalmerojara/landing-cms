"""
Validates AI-generated block JSON against the block schemas.
"""

import json
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

        schema = BLOCK_SCHEMAS[btype]
        for field_name, field_spec in schema['fields'].items():
            value = data.get(field_name)

            if field_spec.get('required') and (value is None or value == ''):
                errors.append(f"{prefix} ({btype}): required field '{field_name}' is missing or empty.")
                continue

            if value is None:
                continue

            expected_type = field_spec['type']
            if expected_type == 'string' and not isinstance(value, str):
                errors.append(f"{prefix} ({btype}): '{field_name}' must be a string, got {type(value).__name__}.")
                continue

            if expected_type == 'boolean' and not isinstance(value, bool):
                errors.append(f"{prefix} ({btype}): '{field_name}' must be a boolean, got {type(value).__name__}.")
                continue

            if isinstance(value, str) and 'max_length' in field_spec:
                if len(value) > field_spec['max_length']:
                    errors.append(
                        f"{prefix} ({btype}): '{field_name}' exceeds max length "
                        f"({len(value)} > {field_spec['max_length']})."
                    )

            if isinstance(value, str) and 'options' in field_spec:
                if value not in field_spec['options']:
                    errors.append(
                        f"{prefix} ({btype}): '{field_name}' must be one of {field_spec['options']}, got '{value}'."
                    )

    return errors


def sanitize_blocks(blocks: list[dict]) -> list[dict]:
    """Fill in defaults for optional fields and strip unknown fields."""
    sanitized = []

    for block in blocks:
        btype = block.get('type')
        if btype not in VALID_BLOCK_TYPES:
            continue

        schema = BLOCK_SCHEMAS[btype]
        data = block.get('data', {})
        clean_data = {}

        for field_name, field_spec in schema['fields'].items():
            value = data.get(field_name)
            if value is None or (isinstance(value, str) and value == '' and not field_spec.get('required')):
                clean_data[field_name] = field_spec.get('default', '' if field_spec['type'] == 'string' else False)
            else:
                # Truncate strings that are too long
                if isinstance(value, str) and 'max_length' in field_spec:
                    value = value[:field_spec['max_length']]
                clean_data[field_name] = value

        sanitized.append({
            'type': btype,
            'data': clean_data,
        })

    return sanitized

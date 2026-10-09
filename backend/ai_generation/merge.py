"""
Merging the result of an AI block edit over the block as it is.

The AI schema covers only part of what a block stores (hero.buttonLink,
badgeText, plans[].buttonLink, the contact placeholders...). Replacing the
block's data with the AI result would silently drop the rest, so only what the
model actually returned overrides the current data.
"""

# An empty value from the model never wipes an image the block already has:
# the prompt tells it to leave images alone, and the schema cannot hold URLs.
IMAGE_FIELDS = frozenset({'backgroundImage', 'logoImage', 'image', 'src'})


def _merge_item(current: dict, returned: dict, cleaned: dict) -> dict:
    merged = dict(current)
    for key, value in cleaned.items():
        if key not in returned:
            continue
        if key in IMAGE_FIELDS and not value and current.get(key):
            continue
        merged[key] = value
    return merged


def merge_block_data(current: dict, returned: dict, cleaned: dict) -> dict:
    """The block data after an edit of the same block type.

    current:  the data stored now.
    returned: the data the model sent, before cleaning (tells which keys it set).
    cleaned:  `returned` after the editor's validation (filled defaults, no unknown keys).

    Keys the model did not return keep their value. Lists follow the model's
    length (extra items are added, missing ones removed); each item is merged
    with the current item at the same index, so the fields of an item that are
    outside the schema survive.
    """
    merged = dict(current)
    for key, value in cleaned.items():
        if key not in returned:
            continue
        old = current.get(key)
        if isinstance(value, list):
            raw_items = returned[key] if isinstance(returned[key], list) else []
            old_items = old if isinstance(old, list) else []
            merged[key] = [
                _merge_item(
                    old_items[index] if index < len(old_items) and isinstance(old_items[index], dict) else {},
                    raw_items[index] if index < len(raw_items) and isinstance(raw_items[index], dict) else {},
                    item,
                ) if isinstance(item, dict) else item
                for index, item in enumerate(value)
            ]
        elif key in IMAGE_FIELDS and not value and old:
            continue
        else:
            merged[key] = value
    return merged

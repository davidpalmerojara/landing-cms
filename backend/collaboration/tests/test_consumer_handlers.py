import asyncio
import re
from pathlib import Path
from unittest.mock import AsyncMock

from collaboration.consumers import PageConsumer

BACKEND_DIR = Path(__file__).resolve().parents[2]
# group_send(...) or async_to_sync(...group_send)(...), then the first 'type' key
GROUP_SEND_TYPE = re.compile(r"group_send\)?\(.{0,200}?'type':\s*'([^']+)'", re.S)


def group_message_types():
    types = set()
    for path in BACKEND_DIR.glob('*/*.py'):
        if 'venv' in path.parts or 'tests' in path.parts:
            continue
        types.update(GROUP_SEND_TYPE.findall(path.read_text()))
    return types


def test_every_group_message_type_has_a_consumer_handler():
    """Channels dispatches 'a.b' to method a_b; a missing handler closes the socket."""
    types = group_message_types()
    assert 'page.restored' in types  # sanity check that the scan finds messages

    missing = sorted(t for t in types if not hasattr(PageConsumer, t.replace('.', '_')))
    assert missing == []


def test_page_restored_is_forwarded_to_the_client():
    consumer = PageConsumer()
    consumer.send_json = AsyncMock()

    asyncio.run(consumer.page_restored({
        'type': 'page.restored', 'version_number': 3, 'restored_by': 'ana', 'restored_by_id': 'u1',
    }))

    consumer.send_json.assert_awaited_once_with({
        'type': 'page_restored', 'version_number': 3, 'restored_by': 'ana', 'restored_by_id': 'u1',
    })

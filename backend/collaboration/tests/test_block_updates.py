import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from collaboration.consumers import PageConsumer, clean_styles
from collaboration.locks import InMemoryLockManager
from tests.factories import BlockFactory, PageFactory, UserFactory


def make_consumer(page, user):
    consumer = PageConsumer()
    consumer.user = user
    consumer.page_id = str(page.id)
    consumer.group_name = f'page_{page.id}'
    consumer.channel_name = 'test-channel'
    consumer.connection_id = 'conn-1'
    consumer.entry = {'connection_id': 'conn-1', 'user_id': str(user.pk), 'username': user.username}
    consumer._joined = True
    consumer.send_json = AsyncMock()
    consumer.channel_layer = MagicMock(group_send=AsyncMock())
    consumer._lock_manager = MagicMock(spec=InMemoryLockManager, get_lock_holder=MagicMock(return_value='conn-1'))
    return consumer


def relayed(consumer):
    return consumer.channel_layer.group_send.await_args.args[1]


@pytest.mark.django_db(transaction=True)
class TestBlockUpdatedRelay:
    def test_html_is_sanitized_before_reaching_other_editors(self):
        user = UserFactory()
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='customHtml', data={'html': '<p>ok</p>'})
        consumer = make_consumer(page, user)

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'html': '<img src=x onerror="fetch(\'//evil\')"><script>steal()</script>'},
        }))

        html = relayed(consumer)['data']['html']
        assert 'onerror' not in html and '<script' not in html

    def test_unknown_fields_and_javascript_urls_are_not_relayed(self):
        user = UserFactory()
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', data={'title': 'Hola'})
        consumer = make_consumer(page, user)

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'title': 'Nuevo', 'href': 'javascript:alert(1)'},
        }))
        assert relayed(consumer)['data'] == {'title': 'Nuevo'}

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'buttonLink': 'javascript:alert(1)'},
        }))
        assert consumer.send_json.await_args.args[0]['code'] == 'invalid_block_data'

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'buttonLink': '/registro'},
        }))
        assert relayed(consumer)['data'] == {'buttonLink': '/registro'}

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'backgroundImage': 'javascript:alert(1)'},
        }))
        assert consumer.send_json.await_args.args[0]['code'] == 'invalid_block_data'

    def test_list_items_are_validated_before_being_relayed(self):
        user = UserFactory()
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='navbar', data={'brandName': 'Acme'})
        consumer = make_consumer(page, user)

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'links': [{'label': 'Docs', 'url': '/docs', 'onclick': 'x()'}]},
        }))
        assert relayed(consumer)['data'] == {'links': [{'label': 'Docs', 'url': '/docs'}]}

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'links': [{'label': 'Docs', 'url': 'javascript:alert(1)'}]},
        }))
        assert consumer.send_json.await_args.args[0]['code'] == 'invalid_block_data'

        asyncio.run(consumer.handle_block_updated({
            'block_id': str(block.id),
            'data': {'links': 'not a list'},
        }))
        assert consumer.send_json.await_args.args[0]['code'] == 'invalid_block_data'

    def test_blocks_of_other_pages_are_rejected(self):
        user = UserFactory()
        page = PageFactory(owner=user)
        foreign = BlockFactory(page=PageFactory(owner=UserFactory()), type='hero')
        consumer = make_consumer(page, user)

        asyncio.run(consumer.handle_block_updated({'block_id': str(foreign.id), 'data': {'title': 'x'}}))

        consumer.channel_layer.group_send.assert_not_awaited()
        assert consumer.send_json.await_args.args[0]['code'] == 'block_not_found'


def test_clean_styles_keeps_primitives_and_drops_the_rest():
    styles = {'paddingTop': '64px', 'bgColor': '#fff', 'evil': {'a': {'b': {'c': 'too deep'}}}, 'fn': ['x'],
              'responsive': {'mobile': {'paddingTop': '32px'}}}
    assert clean_styles(styles) == {
        'paddingTop': '64px', 'bgColor': '#fff', 'evil': {'a': {}}, 'responsive': {'mobile': {'paddingTop': '32px'}},
    }
    assert clean_styles('not a dict') is None
    assert clean_styles({'x': 'y' * 9000}) is None

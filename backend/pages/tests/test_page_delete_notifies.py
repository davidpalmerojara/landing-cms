"""QA-036: deleting a page tells the people editing it (over real in-memory WebSockets)."""
from unittest.mock import patch

import pytest
from asgiref.sync import sync_to_async
from rest_framework.test import APIClient

from billing.models import Plan, Subscription
from collaboration.tests.helpers import TIMEOUT, async_test, next_message, open_socket
from pages.models import Page, Workspace
from tests.factories import PageFactory, UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def plans(db):
    Plan.objects.create(name='free', display_name='Free', max_pages=3)
    Plan.objects.create(name='pro', display_name='Pro', max_pages=-1, has_collaboration=True, max_version_history=-1)


def make_user(plan_name):
    user = UserFactory()
    workspace = Workspace.objects.create(owner=user, name='ws')
    Subscription.objects.update_or_create(
        workspace=workspace, defaults={'plan': Plan.objects.get(name=plan_name), 'status': 'active'},
    )
    return user


def delete_page(user, page):
    client = APIClient()
    client.force_authenticate(user=user)
    return client.delete(f'/api/pages/{page.id}/')


async def assert_kicked_out(socket):
    error = await next_message(socket, 'error')
    assert error['code'] == 'access_revoked'
    close = await socket.receive_output(timeout=TIMEOUT)
    assert (close['type'], close['code']) == ('websocket.close', 4003)
    await socket.disconnect()


@async_test
async def test_deleting_the_page_closes_the_collaborators_and_the_owners_other_tabs():
    owner = await sync_to_async(make_user)('pro')
    collaborator = await sync_to_async(make_user)('free')
    page = await sync_to_async(PageFactory)(owner=owner)
    await sync_to_async(page.collaborators.add)(collaborator)

    async with open_socket(page.id, owner) as (owner_tab, _):
        async with open_socket(page.id, collaborator) as (collaborator_tab, _):
            response = await sync_to_async(delete_page)(owner, page)
            assert response.status_code == 204

            await assert_kicked_out(collaborator_tab)
            await assert_kicked_out(owner_tab)

    assert not await sync_to_async(Page.objects.filter(pk=page.pk).exists)()


def test_every_person_with_access_is_notified_once_even_with_no_one_connected():
    owner = UserFactory()
    first, second = UserFactory(), UserFactory()
    page = PageFactory(owner=owner)
    page.collaborators.add(first, second)

    with patch('pages.views.sync.notify_access_revoked') as notify:
        assert delete_page(owner, page).status_code == 204

    notified = sorted(call.args[1] for call in notify.call_args_list)
    assert notified == sorted([owner.pk, first.pk, second.pk])
    assert {call.args[0] for call in notify.call_args_list} == {page.pk}


def test_a_refused_delete_notifies_nobody():
    owner, collaborator = UserFactory(), UserFactory()
    page = PageFactory(owner=owner)
    page.collaborators.add(collaborator)

    with patch('pages.views.sync.notify_access_revoked') as notify:
        response = delete_page(collaborator, page)

    assert response.status_code == 403
    assert response.data['code'] == 'NOT_OWNER'
    notify.assert_not_called()
    assert Page.objects.filter(pk=page.pk).exists()

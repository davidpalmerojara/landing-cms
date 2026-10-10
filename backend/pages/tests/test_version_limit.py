"""The version list says how many versions the page keeps (QA-086)."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import status

from tests.factories import PageFactory, PageVersionFactory, UserFactory

GET_PLAN = 'billing.permissions.get_user_plan'

pytestmark = pytest.mark.django_db


def plan(max_version_history):
    return SimpleNamespace(name='free', max_version_history=max_version_history)


def list_versions(client, page):
    return client.get(f'/api/pages/{page.id}/versions/')


def test_the_list_carries_the_owners_plan_limit(auth_client, user):
    page = PageFactory(owner=user)
    PageVersionFactory(page=page, version_number=1)
    with patch(GET_PLAN, return_value=plan(5)):
        resp = list_versions(auth_client, page)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['max_versions'] == 5
    assert len(resp.data['results']) == 1


def test_unlimited_plans_say_minus_one(auth_client, user):
    page = PageFactory(owner=user)
    with patch(GET_PLAN, return_value=plan(-1)):
        assert list_versions(auth_client, page).data['max_versions'] == -1


def test_a_collaborator_sees_the_owners_limit_not_their_own(api_client):
    owner = UserFactory()
    collaborator = UserFactory()
    page = PageFactory(owner=owner)
    page.collaborators.add(collaborator)
    api_client.force_authenticate(collaborator)

    def plan_of(user):
        return plan(5 if user == owner else -1)

    with patch(GET_PLAN, side_effect=plan_of):
        assert list_versions(api_client, page).data['max_versions'] == 5


def test_guests_keep_their_own_limit(api_client):
    from accounts.guests import GUEST_MAX_VERSIONS

    guest = UserFactory(is_guest=True)
    page = PageFactory(owner=guest)
    api_client.force_authenticate(guest)
    with patch(GET_PLAN, return_value=plan(5)):
        assert list_versions(api_client, page).data['max_versions'] == GUEST_MAX_VERSIONS

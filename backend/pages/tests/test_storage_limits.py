"""SEC-001 (ADR-052): one account cannot fill the 0.5 GB database.

Measured in the review: a guest wrote a 4.4 MB page of Custom HTML in one
PUT and 9 MB more with two manual versions; Pro (everyone, in the demo) kept
every version. Now a page is capped, an account has a storage budget, version
history is capped for every plan and "Save version" is rate limited.
"""
import uuid
from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from pages.models import Page, PageVersion, create_version_snapshot
from tests.factories import BlockFactory, PageFactory, UserFactory

pytestmark = pytest.mark.django_db
CHECK_LIMIT = 'billing.permissions.check_page_limit'


def html_block(size, order=0):
    return {'id': str(uuid.uuid4()), 'type': 'customHtml', 'order': order, 'data': {'html': 'x' * size}, 'styles': {}}


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def save(client, page, blocks):
    page.refresh_from_db()
    return client.put(f'/api/pages/{page.pk}/', {'name': page.name, 'blocks': blocks, 'version': page.version}, format='json')


@pytest.fixture
def small_limits(settings):
    settings.MAX_PAGE_BYTES = 20_000
    settings.ACCOUNT_STORAGE_LIMIT_BYTES = 50_000
    settings.GUEST_STORAGE_LIMIT_BYTES = 30_000


class TestPageSize:
    def test_sec_001_a_page_over_the_cap_is_a_413(self, small_limits):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        response = save(client_for(owner), page, [html_block(15_000), html_block(15_000, 1)])

        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        assert response.data['code'] == 'PAGE_TOO_LARGE'
        assert page.blocks.count() == 0

    def test_a_page_under_the_cap_saves(self, small_limits):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        assert save(client_for(owner), page, [html_block(5_000)]).status_code == status.HTTP_200_OK

    def test_creating_an_oversized_page_is_refused_too(self, small_limits):
        owner = UserFactory()
        with patch(CHECK_LIMIT):
            response = client_for(owner).post('/api/pages/', {'name': 'X', 'blocks': [html_block(25_000)]}, format='json')
        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        assert not Page.objects.filter(owner=owner).exists()


class TestAccountBudget:
    def fill(self, owner, pages=3, size=15_000):
        for _ in range(pages):
            page = PageFactory(owner=owner)
            BlockFactory(page=page, type='customHtml', data={'html': 'x' * size})

    def test_sec_001_a_save_that_grows_past_the_budget_is_refused(self, small_limits):
        owner = UserFactory()
        self.fill(owner)  # ~45 KB of 50
        page = PageFactory(owner=owner)

        response = save(client_for(owner), page, [html_block(10_000)])

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'STORAGE_LIMIT'

    def test_a_save_that_does_not_grow_the_page_always_goes_through(self, small_limits, settings):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        BlockFactory(page=page, type='customHtml', data={'html': 'x' * 12_000})
        self.fill(owner)
        settings.ACCOUNT_STORAGE_LIMIT_BYTES = 10_000  # far over budget now

        response = save(client_for(owner), page, [html_block(1_000)])

        assert response.status_code == status.HTTP_200_OK

    def test_a_collaborators_save_counts_for_the_owner(self, small_limits):
        owner = UserFactory()
        self.fill(owner)
        page = PageFactory(owner=owner)
        collaborator = UserFactory()
        page.collaborators.add(collaborator)

        response = save(client_for(collaborator), page, [html_block(10_000)])

        assert response.data['code'] == 'STORAGE_LIMIT'

    def test_sec_001_guests_have_a_smaller_budget(self, small_limits):
        from accounts.guests import create_guest
        guest = create_guest()
        self.fill(guest, pages=1)
        page = PageFactory(owner=guest)

        assert save(client_for(guest), page, [html_block(16_000)]).data['code'] == 'STORAGE_LIMIT'

    def test_sec_001_save_version_and_publish_need_room(self, small_limits):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        BlockFactory(page=page, type='customHtml', data={'html': 'x' * 18_000})
        create_version_snapshot(page, owner, 'manual')  # 18 + 18 KB
        client = client_for(owner)

        version = client.post(f'/api/pages/{page.pk}/versions/', {}, format='json')
        publish = client.post(f'/api/pages/{page.pk}/publish/')

        assert version.data['code'] == 'STORAGE_LIMIT'
        assert publish.data['code'] == 'STORAGE_LIMIT'
        assert PageVersion.objects.filter(page=page).count() == 1

    def test_duplicating_needs_room(self, small_limits):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        BlockFactory(page=page, type='customHtml', data={'html': 'x' * 18_000})
        self.fill(owner, pages=2)
        with patch(CHECK_LIMIT):
            response = client_for(owner).post(f'/api/pages/{page.pk}/duplicate/')
        assert response.data['code'] == 'STORAGE_LIMIT'


class TestVersionHistory:
    def test_sec_001_unlimited_history_keeps_the_hard_cap(self, settings):
        settings.MAX_VERSIONS_PER_PAGE = 3
        owner = UserFactory()
        page = PageFactory(owner=owner)
        pro = type('Pro', (), {'max_version_history': -1})()
        with patch('billing.permissions.get_user_plan', return_value=pro):
            for _ in range(5):
                create_version_snapshot(page, owner, 'manual')
        assert PageVersion.objects.filter(page=page).count() == 3

    def test_sec_001_save_version_is_rate_limited(self, settings):
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_RATES': {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'version_create': '2/hour'},
        }
        owner = UserFactory()
        page = PageFactory(owner=owner)
        client = client_for(owner)
        codes = [client.post(f'/api/pages/{page.pk}/versions/', {}, format='json').status_code for _ in range(3)]
        assert codes == [status.HTTP_201_CREATED, status.HTTP_201_CREATED, status.HTTP_429_TOO_MANY_REQUESTS]


class TestServerWrittenLabels:
    def test_code_005_automatic_versions_carry_no_server_text(self):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        BlockFactory(page=page, type='hero')
        client = client_for(owner)

        client.post(f'/api/pages/{page.pk}/publish/')
        published = PageVersion.objects.get(page=page)
        client.post(f'/api/pages/{page.pk}/versions/{published.pk}/restore/')

        labels = dict(PageVersion.objects.filter(page=page).values_list('trigger', 'label'))
        assert labels == {'auto_publish': '', 'auto_restore': ''}

import pytest
from unittest.mock import patch
from rest_framework import status
from pages.models import Page, Block, PageVersion
from tests.factories import (
    UserFactory, WorkspaceFactory, PageFactory, BlockFactory,
    PageVersionFactory,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def page_list_url():
    return '/api/pages/'


def page_detail_url(page_id):
    return f'/api/pages/{page_id}/'


def page_duplicate_url(page_id):
    return f'/api/pages/{page_id}/duplicate/'


def page_share_url(page_id):
    return f'/api/pages/{page_id}/share/'


def page_unshare_url(page_id):
    return f'/api/pages/{page_id}/unshare/'


def version_list_url(page_id):
    return f'/api/pages/{page_id}/versions/'


def version_detail_url(page_id, version_id):
    return f'/api/pages/{page_id}/versions/{version_id}/'


def version_restore_url(page_id, version_id):
    return f'/api/pages/{page_id}/versions/{version_id}/restore/'


# We mock billing.permissions.check_page_limit to avoid needing Plan objects
CHECK_LIMIT = 'billing.permissions.check_page_limit'
GET_PLAN = 'billing.permissions.get_user_plan'


def _mock_plan():
    """Return a mock plan with generous limits."""
    class MockPlan:
        name = 'pro'
        display_name = 'Pro'
        max_pages = 100
        max_version_history = 50
        has_custom_domain = True
        remove_watermark = True
    return MockPlan()


# ── CRUD Tests ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPageCRUD:
    @patch(CHECK_LIMIT)
    def test_create_page(self, mock_limit, auth_client, user):
        data = {
            'name': 'New Page',
            'blocks': [
                {'type': 'hero', 'data': {'title': 'Hi'}, 'styles': {}},
            ],
        }
        resp = auth_client.post(page_list_url(), data, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['name'] == 'New Page'
        assert len(resp.data['blocks']) == 1

    def test_list_pages(self, auth_client, page):
        resp = auth_client.get(page_list_url())
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['count'] >= 1

    def test_retrieve_page(self, auth_client, page):
        resp = auth_client.get(page_detail_url(page.id))
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['id'] == str(page.id)

    def test_update_page(self, auth_client, page):
        data = {
            'name': 'Updated Name',
            'blocks': [],
        }
        resp = auth_client.put(page_detail_url(page.id), data, format='json')
        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.name == 'Updated Name'

    def test_delete_page(self, auth_client, page):
        resp = auth_client.delete(page_detail_url(page.id))
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(pk=page.pk).exists()


# ── Nested Blocks Tests ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestNestedBlocks:
    @patch(CHECK_LIMIT)
    def test_create_page_with_blocks(self, mock_limit, auth_client, user):
        data = {
            'name': 'With Blocks',
            'blocks': [
                {'type': 'hero', 'data': {'title': 'Hello'}, 'styles': {}},
                {'type': 'features', 'data': {}, 'styles': {}},
            ],
        }
        resp = auth_client.post(page_list_url(), data, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert len(resp.data['blocks']) == 2

    def test_update_syncs_blocks(self, auth_client, page_with_blocks):
        page = page_with_blocks
        blocks = list(page.blocks.order_by('order'))
        hero_id = str(blocks[0].id)

        data = {
            'name': page.name,
            'blocks': [
                {'id': hero_id, 'type': 'hero', 'order': 0, 'data': {'title': 'Updated'}, 'styles': {}},
                {'type': 'new_block', 'order': 1, 'data': {}, 'styles': {}},
            ],
        }
        resp = auth_client.put(page_detail_url(page.id), data, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data['blocks']) == 2

        # Original hero updated
        blocks[0].refresh_from_db()
        assert blocks[0].data == {'title': 'Updated'}

        # features and cta blocks deleted
        assert not Block.objects.filter(pk=blocks[1].pk).exists()
        assert not Block.objects.filter(pk=blocks[2].pk).exists()

    def test_update_with_empty_blocks_clears_all(self, auth_client, page_with_blocks):
        page = page_with_blocks
        data = {'name': page.name, 'blocks': []}
        resp = auth_client.put(page_detail_url(page.id), data, format='json')
        assert resp.status_code == status.HTTP_200_OK
        assert page.blocks.count() == 0


# ── Duplicate Tests ──────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPageDuplicate:
    @patch(CHECK_LIMIT)
    def test_duplicate_creates_copy(self, mock_limit, auth_client, page_with_blocks):
        page = page_with_blocks
        resp = auth_client.post(page_duplicate_url(page.id))
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['name'] == f'{page.name} (copy)'
        assert resp.data['status'] == 'draft'
        assert len(resp.data['blocks']) == 3  # same blocks as original

    @patch(CHECK_LIMIT)
    def test_duplicate_creates_new_ids(self, mock_limit, auth_client, page_with_blocks):
        page = page_with_blocks
        original_ids = set(str(b.id) for b in page.blocks.all())
        resp = auth_client.post(page_duplicate_url(page.id))
        new_ids = set(b['id'] for b in resp.data['blocks'])
        assert original_ids.isdisjoint(new_ids)


# ── Permissions Tests ────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPagePermissions:
    def test_user_cannot_access_other_users_page(self, api_client):
        other_user = UserFactory()
        other_page = PageFactory(owner=other_user)

        attacker = UserFactory()
        api_client.force_authenticate(user=attacker)

        resp = api_client.get(page_detail_url(other_page.id))
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_user_cannot_delete_other_users_page(self, api_client):
        other_user = UserFactory()
        other_page = PageFactory(owner=other_user)

        attacker = UserFactory()
        api_client.force_authenticate(user=attacker)

        resp = api_client.delete(page_detail_url(other_page.id))
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_list(self, api_client):
        resp = api_client.get(page_list_url())
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_only_returns_own_pages(self, auth_client, user, page):
        other_user = UserFactory()
        PageFactory(owner=other_user)  # Should not appear

        resp = auth_client.get(page_list_url())
        assert resp.status_code == status.HTTP_200_OK
        page_ids = [p['id'] for p in resp.data['results']]
        assert str(page.id) in page_ids
        assert len(page_ids) == 1


# ── Share / Collaborate Tests ────────────────────────────────────────────────

@pytest.mark.django_db
class TestPageShare:
    def test_owner_can_share(self, auth_client, user, page):
        collaborator = UserFactory(email='collab@example.com')
        resp = auth_client.post(
            page_share_url(page.id),
            {'email': 'collab@example.com'},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        assert collaborator in page.collaborators.all()

    def test_share_with_invalid_email_returns_400(self, auth_client, page):
        resp = auth_client.post(
            page_share_url(page.id),
            {'email': 'not-an-email'},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'email' in resp.data['details']

    def test_owner_can_unshare(self, auth_client, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)

        resp = auth_client.post(
            page_unshare_url(page.id),
            {'user_id': str(collaborator.id)},
            format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        assert collaborator not in page.collaborators.all()

    def test_unshare_without_user_id_returns_400(self, auth_client, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)

        resp = auth_client.post(
            page_unshare_url(page.id),
            {'user_id': ''},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'user_id' in resp.data['details']

    def test_collaborator_can_retrieve(self, api_client, user, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        api_client.force_authenticate(user=collaborator)

        resp = api_client.get(page_detail_url(page.id))
        assert resp.status_code == status.HTTP_200_OK

    def test_collaborator_cannot_delete(self, api_client, user, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        api_client.force_authenticate(user=collaborator)

        resp = api_client.delete(page_detail_url(page.id))
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_shared_pages_appear_in_list(self, api_client, page):
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        api_client.force_authenticate(user=collaborator)

        resp = api_client.get(page_list_url())
        assert resp.status_code == status.HTTP_200_OK
        page_ids = [p['id'] for p in resp.data['results']]
        assert str(page.id) in page_ids


# ── Publish Tests ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPublish:
    def test_update_status_to_published(self, auth_client, page_with_blocks):
        page = page_with_blocks
        data = {
            'name': page.name,
            'status': 'published',
            'blocks': [
                {'id': str(b.id), 'type': b.type, 'order': b.order, 'data': b.data, 'styles': b.styles}
                for b in page.blocks.all()
            ],
        }
        with patch(GET_PLAN, return_value=_mock_plan()):
            resp = auth_client.put(page_detail_url(page.id), data, format='json')
        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.status == 'published'


# ── Version History Tests ────────────────────────────────────────────────────

@pytest.mark.django_db
class TestVersionHistory:
    @patch(GET_PLAN, return_value=_mock_plan())
    def test_create_version(self, mock_plan, auth_client, user, page_with_blocks):
        resp = auth_client.post(
            version_list_url(page_with_blocks.id),
            {'label': 'My snapshot'},
            format='json',
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['label'] == 'My snapshot'
        assert resp.data['version_number'] == 1

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_list_versions(self, mock_plan, auth_client, user, page):
        PageVersionFactory(page=page, version_number=1, created_by=user)
        PageVersionFactory(page=page, version_number=2, created_by=user)

        resp = auth_client.get(version_list_url(page.id))
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['count'] == 2

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_update_version_label(self, mock_plan, auth_client, user, page):
        version = PageVersionFactory(page=page, version_number=1, created_by=user, label='Antes')

        resp = auth_client.patch(
            version_detail_url(page.id, version.id),
            {'label': 'Después'},
            format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        version.refresh_from_db()
        assert version.label == 'Después'

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_update_version_label_with_too_long_value_returns_400(self, mock_plan, auth_client, user, page):
        version = PageVersionFactory(page=page, version_number=1, created_by=user, label='Antes')

        resp = auth_client.patch(
            version_detail_url(page.id, version.id),
            {'label': 'x' * 201},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'label' in resp.data['details']

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_restore_version(self, mock_plan, auth_client, user, page_with_blocks):
        page = page_with_blocks
        # Create a version snapshot
        version = PageVersionFactory(
            page=page,
            version_number=1,
            created_by=user,
            snapshot=[
                {'type': 'footer', 'order': 0, 'data': {'text': 'Restored'}, 'styles': {}},
            ],
        )

        resp = auth_client.post(version_restore_url(page.id, version.id))
        assert resp.status_code == status.HTTP_200_OK
        # Page should now have only the restored block
        page.refresh_from_db()
        assert page.blocks.count() == 1
        assert page.blocks.first().type == 'footer'


# ── Edge Cases ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestEdgeCases:
    @patch(CHECK_LIMIT)
    def test_create_page_with_no_blocks(self, mock_limit, auth_client, user):
        data = {'name': 'Empty Page', 'blocks': []}
        resp = auth_client.post(page_list_url(), data, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert len(resp.data['blocks']) == 0

    def test_partial_update_page(self, auth_client, page):
        resp = auth_client.patch(
            page_detail_url(page.id),
            {'name': 'Patched'},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.name == 'Patched'


@pytest.mark.django_db
class TestBlockSecurity:
    @patch(CHECK_LIMIT)
    def test_create_page_strips_script_tags_from_plain_text(self, mock_limit, auth_client):
        resp = auth_client.post(
            page_list_url(),
            {
                'name': 'Unsafe Hero',
                'blocks': [
                    {'type': 'hero', 'data': {'title': '<script>alert(1)</script>Hello'}, 'styles': {}},
                ],
            },
            format='json',
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['blocks'][0]['data']['title'] == 'alert(1)Hello'

    @patch(CHECK_LIMIT)
    def test_create_page_strips_custom_html_event_handlers(self, mock_limit, auth_client):
        resp = auth_client.post(
            page_list_url(),
            {
                'name': 'Unsafe HTML',
                'blocks': [
                    {'type': 'customHtml', 'data': {'html': '<img src="https://example.com/x.png" onerror="alert(1)">'}, 'styles': {}},
                ],
            },
            format='json',
        )
        assert resp.status_code == status.HTTP_201_CREATED
        html = resp.data['blocks'][0]['data']['html']
        assert 'onerror' not in html
        assert '<img' in html

    @patch(CHECK_LIMIT)
    def test_create_page_rejects_unsafe_image_urls(self, mock_limit, auth_client):
        resp = auth_client.post(
            page_list_url(),
            {
                'name': 'Unsafe URL',
                'blocks': [
                    {'type': 'hero', 'data': {'backgroundImage': 'javascript:alert(1)'}, 'styles': {}},
                ],
            },
            format='json',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data == {
            'error': 'Error de validación.',
            'code': 'BAD_REQUEST',
            'details': {
                'blocks': [{'data': {'backgroundImage': ['URL no permitida: javascript:alert(1)']}}],
            },
        }

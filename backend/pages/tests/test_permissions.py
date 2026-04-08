import pytest
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from analytics.models import AnalyticsEvent
from pages.models import Page, PageVersion
from tests.factories import (
    AssetFactory,
    BlockFactory,
    CustomDomainFactory,
    PageFactory,
    UserFactory,
    WorkspaceFactory,
)


CHECK_LIMIT = 'billing.permissions.check_page_limit'
GET_PLAN = 'billing.permissions.get_user_plan'
CHECK_FEATURE = 'billing.permissions.check_feature'
RESOLVE_PROVIDER = 'ai_generation.views.resolve_provider'
CALL_AI = 'ai_generation.views.call_ai'


def _mock_plan():
    class MockPlan:
        name = 'pro'
        display_name = 'Pro'
        max_pages = 100
        max_version_history = 50
        max_ai_generations_per_hour = -1
        has_custom_domain = True
        has_analytics = True
        remove_watermark = True
    return MockPlan()


def page_duplicate_url(page_id):
    return f'/api/pages/{page_id}/duplicate/'


def version_list_url(page_id):
    return f'/api/pages/{page_id}/versions/'


def version_restore_url(page_id, version_id):
    return f'/api/pages/{page_id}/versions/{version_id}/restore/'


def page_generate_url(page_id):
    return f'/api/pages/{page_id}/generate/'


def block_edit_ai_url(page_id, block_id):
    return f'/api/pages/{page_id}/blocks/{block_id}/edit-ai/'


def analytics_url(page_id):
    return f'/api/pages/{page_id}/analytics/'


@pytest.mark.django_db
class TestPageWorkspaceAssignment:
    @patch(CHECK_LIMIT)
    def test_create_page_assigns_current_users_workspace(self, mock_limit, auth_client, user):
        workspace = WorkspaceFactory(owner=user)

        resp = auth_client.post(
            '/api/pages/',
            {'name': 'Assigned Workspace', 'blocks': []},
            format='json',
        )

        assert resp.status_code == status.HTTP_201_CREATED
        page = Page.objects.get(pk=resp.data['id'])
        assert page.workspace == workspace

    @patch(CHECK_LIMIT)
    def test_duplicate_shared_page_assigns_duplicators_workspace(self, mock_limit, api_client):
        owner = UserFactory()
        owner_workspace = WorkspaceFactory(owner=owner)
        page = PageFactory(owner=owner, workspace=owner_workspace)
        BlockFactory(page=page, type='hero', order=0)

        collaborator = UserFactory()
        collaborator_workspace = WorkspaceFactory(owner=collaborator)
        page.collaborators.add(collaborator)

        api_client.force_authenticate(user=collaborator)
        resp = api_client.post(page_duplicate_url(page.id))

        assert resp.status_code == status.HTTP_201_CREATED
        duplicated = Page.objects.get(pk=resp.data['id'])
        assert duplicated.owner == collaborator
        assert duplicated.workspace == collaborator_workspace
        assert duplicated.workspace != owner_workspace


@pytest.mark.django_db
class TestResolveDomainPublicResponse:
    def test_resolve_domain_only_returns_slug_and_domain_verified(self, api_client):
        owner = UserFactory()
        workspace = WorkspaceFactory(owner=owner)
        page = PageFactory(owner=owner, workspace=workspace, status='published')
        domain = CustomDomainFactory(
            workspace=workspace,
            page=page,
            domain='landing.example.com',
            is_active=True,
        )

        resp = api_client.get('/api/public/resolve-domain/?domain=landing.example.com')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == {
            'slug': page.slug,
            'domain_verified': True,
        }


@pytest.mark.django_db
class TestDuplicatePermissions:
    @patch(CHECK_LIMIT)
    def test_owner_can_duplicate(self, mock_limit, auth_client, user):
        WorkspaceFactory(owner=user)
        page = PageFactory(owner=user)

        resp = auth_client.post(page_duplicate_url(page.id))

        assert resp.status_code == status.HTTP_201_CREATED

    @patch(CHECK_LIMIT)
    def test_other_user_cannot_duplicate(self, mock_limit, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        resp = api_client.post(page_duplicate_url(page.id))

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_duplicate(self, api_client):
        page = PageFactory()

        resp = api_client.post(page_duplicate_url(page.id))

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestVersionPermissions:
    @patch(GET_PLAN, return_value=_mock_plan())
    def test_owner_can_list_and_create_versions(self, mock_plan, auth_client, user):
        page = PageFactory(owner=user)
        PageVersion.objects.create(
            page=page,
            version_number=1,
            snapshot=[],
            page_metadata={},
            trigger='manual',
            created_by=user,
        )

        list_resp = auth_client.get(version_list_url(page.id))
        create_resp = auth_client.post(version_list_url(page.id), {'label': 'snapshot'}, format='json')

        assert list_resp.status_code == status.HTTP_200_OK
        assert create_resp.status_code == status.HTTP_201_CREATED

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_other_user_cannot_access_versions(self, mock_plan, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        list_resp = api_client.get(version_list_url(page.id))
        create_resp = api_client.post(version_list_url(page.id), {'label': 'snapshot'}, format='json')

        assert list_resp.status_code == status.HTTP_404_NOT_FOUND
        assert create_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_access_versions(self, api_client):
        page = PageFactory()

        list_resp = api_client.get(version_list_url(page.id))
        create_resp = api_client.post(version_list_url(page.id), {'label': 'snapshot'}, format='json')

        assert list_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert create_resp.status_code == status.HTTP_401_UNAUTHORIZED

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_owner_can_restore_version(self, mock_plan, auth_client, user):
        page = PageFactory(owner=user)
        version = PageVersion.objects.create(
            page=page,
            version_number=1,
            snapshot=[{'type': 'hero', 'order': 0, 'data': {'title': 'Restored'}, 'styles': {}}],
            page_metadata={},
            trigger='manual',
            created_by=user,
        )

        resp = auth_client.post(version_restore_url(page.id, version.id))

        assert resp.status_code == status.HTTP_200_OK

    @patch(GET_PLAN, return_value=_mock_plan())
    def test_other_user_cannot_restore_version(self, mock_plan, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        version = PageVersion.objects.create(
            page=page,
            version_number=1,
            snapshot=[],
            page_metadata={},
            trigger='manual',
            created_by=owner,
        )
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        resp = api_client.post(version_restore_url(page.id, version.id))

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_restore_version(self, api_client):
        page = PageFactory()
        version = PageVersion.objects.create(
            page=page,
            version_number=1,
            snapshot=[],
            page_metadata={},
            trigger='manual',
            created_by=page.owner,
        )

        resp = api_client.post(version_restore_url(page.id, version.id))

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAssetPermissions:
    def test_owner_can_list_and_upload_assets(self, auth_client, user):
        AssetFactory(owner=user)
        upload = SimpleUploadedFile('asset.png', b'pngdata', content_type='image/png')

        list_resp = auth_client.get('/api/assets/')
        create_resp = auth_client.post('/api/assets/', {'file': upload}, format='multipart')

        assert list_resp.status_code == status.HTTP_200_OK
        assert create_resp.status_code == status.HTTP_201_CREATED

    def test_owner_can_delete_own_asset(self, auth_client, user):
        asset = AssetFactory(owner=user)

        resp = auth_client.delete(f'/api/assets/{asset.id}/')

        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_other_user_cannot_see_or_delete_foreign_asset(self, api_client):
        owner = UserFactory()
        asset = AssetFactory(owner=owner)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        list_resp = api_client.get('/api/assets/')
        delete_resp = api_client.delete(f'/api/assets/{asset.id}/')

        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.data['count'] == 0
        assert delete_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_list_upload_or_delete_assets(self, api_client):
        asset = AssetFactory()
        upload = SimpleUploadedFile('asset.png', b'pngdata', content_type='image/png')

        list_resp = api_client.get('/api/assets/')
        create_resp = api_client.post('/api/assets/', {'file': upload}, format='multipart')
        delete_resp = api_client.delete(f'/api/assets/{asset.id}/')

        assert list_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert create_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert delete_resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAIPermissions:
    @patch(GET_PLAN, return_value=_mock_plan())
    @patch(RESOLVE_PROVIDER, return_value=('gemini', 'fake-key'))
    @patch(CALL_AI)
    def test_owner_can_generate_and_edit_block(self, mock_ai, mock_provider, mock_plan, auth_client, user):
        generated_page = PageFactory(owner=user)
        editable_page = PageFactory(owner=user)
        block = BlockFactory(page=editable_page, type='hero', order=0, data={'title': 'Old'})

        mock_ai.side_effect = [
            SimpleNamespace(
                text='[{\"type\":\"hero\",\"data\":{\"title\":\"Hello\",\"subtitle\":\"World\",\"buttonText\":\"Go\",\"backgroundImage\":\"\",\"alignment\":\"center\"}}]',
                tokens_in=10,
                tokens_out=20,
            ),
            SimpleNamespace(
                text='{\"type\":\"hero\",\"data\":{\"title\":\"Updated\",\"subtitle\":\"World\",\"buttonText\":\"Go\",\"backgroundImage\":\"\",\"alignment\":\"center\"}}',
                tokens_in=8,
                tokens_out=16,
            ),
        ]

        generate_resp = auth_client.post(
            page_generate_url(generated_page.id),
            {'prompt': 'Make a hero'},
            format='json',
        )
        edit_resp = auth_client.post(
            block_edit_ai_url(editable_page.id, block.id),
            {'instruction': 'Change title'},
            format='json',
        )

        assert generate_resp.status_code == status.HTTP_200_OK
        assert edit_resp.status_code == status.HTTP_200_OK

    def test_other_user_cannot_generate_or_edit_block(self, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        block = BlockFactory(page=page, type='hero', order=0)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        generate_resp = api_client.post(page_generate_url(page.id), {'prompt': 'Make a hero'}, format='json')
        edit_resp = api_client.post(
            block_edit_ai_url(page.id, block.id),
            {'instruction': 'Change title'},
            format='json',
        )

        assert generate_resp.status_code == status.HTTP_404_NOT_FOUND
        assert edit_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_generate_or_edit_block(self, api_client):
        page = PageFactory()
        block = BlockFactory(page=page, type='hero', order=0)

        generate_resp = api_client.post(page_generate_url(page.id), {'prompt': 'Make a hero'}, format='json')
        edit_resp = api_client.post(
            block_edit_ai_url(page.id, block.id),
            {'instruction': 'Change title'},
            format='json',
        )

        assert generate_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert edit_resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAnalyticsPermissions:
    @patch(CHECK_FEATURE)
    def test_owner_can_view_analytics(self, mock_feature, auth_client, user):
        page = PageFactory(owner=user)
        AnalyticsEvent.objects.create(
            page=page,
            visitor_id='v1',
            event_type=AnalyticsEvent.EventType.PAGEVIEW,
        )

        resp = auth_client.get(analytics_url(page.id))

        assert resp.status_code == status.HTTP_200_OK

    @patch(CHECK_FEATURE)
    def test_other_user_cannot_view_analytics(self, mock_feature, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        resp = api_client.get(analytics_url(page.id))

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_view_analytics(self, api_client):
        page = PageFactory()

        resp = api_client.get(analytics_url(page.id))

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

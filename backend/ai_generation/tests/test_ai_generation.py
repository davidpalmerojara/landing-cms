from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import status

from ai_generation.models import AIGenerationLog
from pages.models import Page, Block
from tests.factories import PageFactory, BlockFactory, UserFactory


GET_PLAN = 'billing.permissions.get_user_plan'
RESOLVE_PROVIDER = 'ai_generation.views.resolve_provider'
CALL_AI = 'ai_generation.views.call_ai'


def mock_plan():
    return SimpleNamespace(
        name='pro',
        display_name='Pro',
        max_pages=100,
        max_version_history=50,
        max_ai_generations_per_hour=10,
        has_custom_domain=True,
        has_analytics=True,
        remove_watermark=True,
    )


@pytest.mark.django_db
class TestAIGenerationViews:
    @patch(GET_PLAN, return_value=mock_plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key'))
    @patch(CALL_AI)
    def test_generate_page_creates_blocks(self, mock_ai, mock_provider, mock_plan_patch, auth_client, user):
        page = PageFactory(owner=user)
        mock_ai.return_value = SimpleNamespace(
            text='[{"type":"hero","data":{"title":"Hola","subtitle":"Mundo","buttonText":"Empezar","backgroundImage":"","alignment":"center"}}]',
            tokens_in=10,
            tokens_out=20,
        )

        resp = auth_client.post(
            f'/api/pages/{page.id}/generate/',
            {'prompt': 'Landing page for a coffee shop'},
            format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['block_count'] == 1
        assert resp.data['blocks'][0]['type'] == 'hero'
        page.refresh_from_db()
        assert page.blocks.count() == 1

    def test_generate_page_without_auth_returns_401(self, api_client, user):
        page = PageFactory(owner=user)

        resp = api_client.post(
            f'/api/pages/{page.id}/generate/',
            {'prompt': 'Landing page'},
            format='json',
        )

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_generate_page_from_other_workspace_returns_404(self, api_client):
        owner = UserFactory()
        page = PageFactory(owner=owner)
        other_user = UserFactory()
        api_client.force_authenticate(user=other_user)

        resp = api_client.post(
            f'/api/pages/{page.id}/generate/',
            {'prompt': 'Landing page'},
            format='json',
        )

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_generate_page_with_invalid_language_returns_400(self, auth_client, user):
        page = PageFactory(owner=user)

        resp = auth_client.post(
            f'/api/pages/{page.id}/generate/',
            {'prompt': 'Landing page', 'language': 'fr'},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'language' in resp.data['details']

    @patch(GET_PLAN, return_value=mock_plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key'))
    @patch(CALL_AI)
    def test_edit_block_with_ai_updates_block(self, mock_ai, mock_provider, mock_plan_patch, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data={
            'title': 'Old title',
            'subtitle': 'Old subtitle',
            'buttonText': 'Go',
            'backgroundImage': '',
            'alignment': 'center',
        })
        mock_ai.return_value = SimpleNamespace(
            text='{"type":"hero","data":{"title":"Updated title","subtitle":"Updated subtitle","buttonText":"Go","backgroundImage":"","alignment":"center"}}',
            tokens_in=8,
            tokens_out=16,
        )

        resp = auth_client.post(
            f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/',
            {'instruction': 'Change the title'},
            format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        block.refresh_from_db()
        assert block.data['title'] == 'Updated title'

    def test_edit_block_with_too_long_instruction_returns_400(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data={
            'title': 'Old title',
            'subtitle': 'Old subtitle',
            'buttonText': 'Go',
            'backgroundImage': '',
            'alignment': 'center',
        })

        resp = auth_client.post(
            f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/',
            {'instruction': 'x' * 1001},
            format='json',
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'instruction' in resp.data['details']

    @patch(GET_PLAN, return_value=mock_plan())
    def test_ai_generation_rate_limit_returns_429_after_limit(self, mock_plan_patch, auth_client, user):
        page = PageFactory(owner=user)
        for i in range(10):
            AIGenerationLog.objects.create(
                user=user,
                page=page,
                prompt=f'prompt {i}',
                mode=AIGenerationLog.Mode.FULL_PAGE,
                tokens_in=0,
                tokens_out=0,
                cost_estimate=0,
            )

        resp = auth_client.post(
            f'/api/pages/{page.id}/generate/',
            {'prompt': 'Another page'},
            format='json',
        )

        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS

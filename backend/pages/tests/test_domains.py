import pytest
from unittest.mock import patch

from rest_framework import status

from billing.models import Subscription, Plan
from pages.models import CustomDomain
from tests.factories import PageFactory, UserFactory, WorkspaceFactory, CustomDomainFactory


def get_plans() -> tuple[Plan, Plan]:
    free_plan, _ = Plan.objects.get_or_create(
        name='free',
        defaults={
            'display_name': 'Free',
            'price_monthly': 0,
            'price_yearly': 0,
            'max_pages': 3,
            'max_ai_generations_per_hour': 0,
            'has_analytics': False,
            'has_collaboration': False,
            'has_custom_domain': False,
            'has_ab_testing': False,
            'remove_watermark': False,
            'max_version_history': 5,
            'is_active': True,
        },
    )
    pro_plan, _ = Plan.objects.get_or_create(
        name='pro',
        defaults={
            'display_name': 'Pro',
            'price_monthly': 19,
            'price_yearly': 190,
            'stripe_price_id_monthly': 'price_monthly_test',
            'stripe_price_id_yearly': 'price_yearly_test',
            'max_pages': 100,
            'max_ai_generations_per_hour': 10,
            'has_analytics': True,
            'has_collaboration': True,
            'has_custom_domain': True,
            'has_ab_testing': False,
            'remove_watermark': True,
            'max_version_history': 50,
            'is_active': True,
        },
    )
    return free_plan, pro_plan


def make_paid_user():
    free_plan, pro_plan = get_plans()
    user = UserFactory()
    workspace = WorkspaceFactory(owner=user)
    subscription = workspace.subscription
    subscription.plan = pro_plan
    subscription.status = Subscription.Status.ACTIVE
    subscription.save(update_fields=['plan', 'status'])
    return user, workspace, subscription, free_plan, pro_plan


@pytest.mark.django_db
class TestCustomDomainViews:
    def test_list_returns_only_domains_from_users_workspace(self, auth_client, user):
        _, workspace, _, _, _ = make_paid_user()
        # Replace the auth_client user with the paid user for this test
        auth_client.force_authenticate(user=workspace.owner)
        page = PageFactory(owner=workspace.owner, workspace=workspace)
        owned = CustomDomainFactory(workspace=workspace, page=page, domain='owned.example.com')

        other_user, other_workspace, _, _, _ = make_paid_user()
        other_page = PageFactory(owner=other_user, workspace=other_workspace)
        CustomDomainFactory(workspace=other_workspace, page=other_page, domain='other.example.com')

        resp = auth_client.get('/api/domains/')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['count'] == 1
        assert resp.data['results'][0]['domain'] == owned.domain

    def test_create_domain_starts_pending(self, auth_client):
        user, workspace, _, _, _ = make_paid_user()
        auth_client.force_authenticate(user=user)
        page = PageFactory(owner=user, workspace=workspace)

        resp = auth_client.post('/api/domains/', {'domain': 'landing.example.com', 'page': str(page.id)}, format='json')

        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['dns_status'] == 'pending'
        assert CustomDomain.objects.filter(domain='landing.example.com', workspace=workspace).exists()

    def test_duplicate_domain_rejected(self, auth_client):
        user, workspace, _, _, _ = make_paid_user()
        auth_client.force_authenticate(user=user)
        page = PageFactory(owner=user, workspace=workspace)
        CustomDomainFactory(workspace=workspace, page=page, domain='duplicate.example.com')

        resp = auth_client.post('/api/domains/', {'domain': 'duplicate.example.com', 'page': str(page.id)}, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_free_plan_cannot_create_custom_domains(self, auth_client):
        free_plan, _ = get_plans()
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        subscription = workspace.subscription
        subscription.plan = free_plan
        subscription.status = Subscription.Status.FREE
        subscription.save(update_fields=['plan', 'status'])
        auth_client.force_authenticate(user=user)

        resp = auth_client.post('/api/domains/', {'domain': 'blocked.example.com'}, format='json')

        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_domain_removes_it(self, auth_client):
        user, workspace, _, _, _ = make_paid_user()
        auth_client.force_authenticate(user=user)
        page = PageFactory(owner=user, workspace=workspace)
        domain = CustomDomainFactory(workspace=workspace, page=page, domain='delete.example.com')

        resp = auth_client.delete(f'/api/domains/{domain.id}/')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not CustomDomain.objects.filter(pk=domain.pk).exists()

    def test_delete_domain_from_other_workspace_returns_404(self, api_client):
        owner, workspace, _, _, _ = make_paid_user()
        page = PageFactory(owner=owner, workspace=workspace)
        domain = CustomDomainFactory(workspace=workspace, page=page, domain='owned-by-owner.example.com')

        other_user, _, _, _, _ = make_paid_user()
        api_client.force_authenticate(user=other_user)

        resp = api_client.delete(f'/api/domains/{domain.id}/')

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    @patch('socket.gethostbyname', return_value='76.223.0.1')
    def test_verify_domain_triggers_dns_check(self, mock_gethostbyname, auth_client):
        user, workspace, _, _, _ = make_paid_user()
        auth_client.force_authenticate(user=user)
        page = PageFactory(owner=user, workspace=workspace)
        domain = CustomDomainFactory(workspace=workspace, page=page, domain='verify.example.com')

        resp = auth_client.post(f'/api/domains/{domain.id}/verify/')

        assert resp.status_code == status.HTTP_200_OK
        domain.refresh_from_db()
        assert domain.dns_status == 'verified'
        assert domain.is_active is True
        mock_gethostbyname.assert_called_once_with('verify.example.com')


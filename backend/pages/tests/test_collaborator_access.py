"""Owner and collaborators (QA-002, QA-013, QA-023, D1 / ADR-032).

An owner with two or more collaborators got a 500 on versions and analytics
(the collaborators join repeated the page). What decides what the public sees
or takes the page elsewhere is owner-only: 403 NOT_OWNER.
"""
from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from pages.models import Page, PageVersion
from tests.factories import BlockFactory, PageFactory, PageVersionFactory, UserFactory

GET_PLAN = 'billing.permissions.get_user_plan'
CHECK_LIMIT = 'billing.permissions.check_page_limit'


class ProPlan:
    name = 'pro'
    display_name = 'Pro'
    max_pages = -1
    max_version_history = -1
    max_ai_generations_per_hour = -1
    has_custom_domain = True
    has_analytics = True
    remove_watermark = True


@pytest.fixture(autouse=True)
def pro_plan():
    with patch(GET_PLAN, return_value=ProPlan()), patch(CHECK_LIMIT):
        yield


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def owner():
    return UserFactory()


@pytest.fixture
def shared_page(owner):
    """A page of `owner` with two collaborators and a block."""
    page = PageFactory(owner=owner)
    BlockFactory(page=page, type='hero', order=0, data={'title': 'T'})
    page.collaborators.add(UserFactory(), UserFactory())
    return page


@pytest.fixture
def collaborator(shared_page):
    return shared_page.collaborators.first()


@pytest.fixture
def stranger():
    return UserFactory()


def versions_url(page):
    return f'/api/pages/{page.id}/versions/'


# --- QA-002 ------------------------------------------------------------------

@pytest.mark.django_db
class TestOwnerOfAPageWithSeveralCollaborators:
    def test_versions_list_create_restore_and_delete_work(self, owner, shared_page):
        client = client_for(owner)

        created = client.post(versions_url(shared_page), {'label': 'one'}, format='json')
        assert created.status_code == status.HTTP_201_CREATED
        listed = client.get(versions_url(shared_page))
        assert listed.status_code == status.HTTP_200_OK
        assert listed.data['count'] == 1

        second = client.post(versions_url(shared_page), {'label': 'two'}, format='json')
        restored = client.post(f'{versions_url(shared_page)}{created.data["id"]}/restore/')
        assert restored.status_code == status.HTTP_200_OK
        deleted = client.delete(f'{versions_url(shared_page)}{second.data["id"]}/')
        assert deleted.status_code == status.HTTP_204_NO_CONTENT

    def test_analytics_loads(self, owner, shared_page):
        response = client_for(owner).get(f'/api/pages/{shared_page.id}/analytics/')
        assert response.status_code == status.HTTP_200_OK

    def test_each_collaborator_can_also_use_versions_and_analytics(self, shared_page):
        for collaborator in shared_page.collaborators.all():
            client = client_for(collaborator)
            assert client.get(versions_url(shared_page)).status_code == status.HTTP_200_OK
            assert client.get(f'/api/pages/{shared_page.id}/analytics/').status_code == status.HTTP_200_OK

    def test_a_stranger_gets_404_not_a_leak(self, stranger, shared_page):
        client = client_for(stranger)
        assert client.get(versions_url(shared_page)).status_code == status.HTTP_404_NOT_FOUND
        assert client.get(f'/api/pages/{shared_page.id}/analytics/').status_code == status.HTTP_404_NOT_FOUND


class FreePlan(ProPlan):
    name = 'free'
    has_analytics = False


@pytest.mark.django_db
class TestAnalyticsFollowTheOwnersPlan:
    """SEC2-008: analytics is a feature of the page owner's plan (ADR-032), not of the viewer's."""

    def test_a_free_collaborator_sees_a_pro_owners_analytics(self, owner, shared_page, collaborator):
        def plan_of(user):
            return ProPlan() if user.pk == owner.pk else FreePlan()

        with patch(GET_PLAN, side_effect=plan_of):
            response = client_for(collaborator).get(f'/api/pages/{shared_page.id}/analytics/')

        assert response.status_code == status.HTTP_200_OK

    def test_a_pro_collaborator_does_not_unlock_a_free_owners_analytics(self, owner, shared_page, collaborator):
        def plan_of(user):
            return FreePlan() if user.pk == owner.pk else ProPlan()

        with patch(GET_PLAN, side_effect=plan_of):
            response = client_for(collaborator).get(f'/api/pages/{shared_page.id}/analytics/')

        assert response.status_code == status.HTTP_403_FORBIDDEN


# --- QA-023 / D1 -------------------------------------------------------------

OWNER_ONLY = [
    pytest.param('post', 'publish/', None, id='publish'),
    pytest.param('post', 'unpublish/', None, id='unpublish'),
    pytest.param('post', 'duplicate/', None, id='duplicate'),
    pytest.param('post', 'generate/', {'prompt': 'A landing for a bakery'}, id='ai-generate-whole-page'),
    pytest.param('delete', '', None, id='delete-page'),
    pytest.param('post', 'share/', {'email': 'someone@example.com'}, id='share'),
    pytest.param('post', 'unshare/', {'user_id': '00000000-0000-4000-8000-000000000000'}, id='unshare'),
    pytest.param('post', 'invite/', None, id='invite'),
]


@pytest.mark.django_db
class TestOnlyTheOwnerDecidesWhatTheCollaboratorsCannot:
    @pytest.mark.parametrize(('method', 'path', 'body'), OWNER_ONLY)
    def test_collaborator_gets_403_not_owner(self, collaborator, shared_page, method, path, body):
        response = getattr(client_for(collaborator), method)(
            f'/api/pages/{shared_page.id}/{path}', *([body] if body else []), format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'NOT_OWNER'
        assert response.data['error']

    def test_collaborator_cannot_delete_a_version(self, collaborator, shared_page):
        version = PageVersionFactory(page=shared_page, version_number=1)
        PageVersionFactory(page=shared_page, version_number=2)
        response = client_for(collaborator).delete(f'{versions_url(shared_page)}{version.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['code'] == 'NOT_OWNER'
        assert PageVersion.objects.filter(pk=version.pk).exists()

    def test_nothing_changed_after_the_refused_calls(self, collaborator, shared_page):
        client = client_for(collaborator)
        client.post(f'/api/pages/{shared_page.id}/publish/')
        client.post(f'/api/pages/{shared_page.id}/duplicate/')
        shared_page.refresh_from_db()
        assert shared_page.status == Page.Status.DRAFT
        assert shared_page.published_version_id is None
        assert Page.objects.count() == 1

    def test_owner_publishes_unpublishes_and_duplicates(self, owner, shared_page):
        client = client_for(owner)
        published = client.post(f'/api/pages/{shared_page.id}/publish/')
        assert published.status_code == status.HTTP_200_OK
        assert published.data['status'] == 'published'
        unpublished = client.post(f'/api/pages/{shared_page.id}/unpublish/')
        assert unpublished.status_code == status.HTTP_200_OK
        assert unpublished.data['status'] == 'draft'
        duplicated = client.post(f'/api/pages/{shared_page.id}/duplicate/')
        assert duplicated.status_code == status.HTTP_201_CREATED

    def test_owner_deletes_the_page(self, owner, shared_page):
        assert client_for(owner).delete(f'/api/pages/{shared_page.id}/').status_code == status.HTTP_204_NO_CONTENT

    def test_a_stranger_still_gets_404_on_every_owner_only_action(self, stranger, shared_page):
        client = client_for(stranger)
        assert client.post(f'/api/pages/{shared_page.id}/publish/').status_code == status.HTTP_404_NOT_FOUND
        assert client.post(f'/api/pages/{shared_page.id}/generate/', {'prompt': 'x'}, format='json').status_code == 404
        assert client.delete(f'/api/pages/{shared_page.id}/').status_code == status.HTTP_404_NOT_FOUND

    def test_collaborator_keeps_editing_ai_editing_a_block_and_versions(self, collaborator, shared_page):
        client = client_for(collaborator)
        block = shared_page.blocks.get()

        saved = client.put(f'/api/pages/{shared_page.id}/', {
            'name': 'Renamed', 'version': shared_page.version, 'blocks': [
                {'id': str(block.id), 'type': 'hero', 'order': 0, 'data': {'title': 'Edited'}, 'styles': {}},
            ],
        }, format='json')
        assert saved.status_code == status.HTTP_200_OK, saved.data

        created = client.post(versions_url(shared_page), {'label': 'mine'}, format='json')
        assert created.status_code == status.HTTP_201_CREATED
        restored = client.post(f'{versions_url(shared_page)}{created.data["id"]}/restore/')
        assert restored.status_code == status.HTTP_200_OK

        with patch('ai_generation.views.choose_route') as route:
            from ai_generation.views import Route
            route.return_value = Route(source='demo')
            edited = client.post(
                f'/api/pages/{shared_page.id}/blocks/{block.id}/edit-ai/', {'instruction': 'shorter'}, format='json',
            )
        assert edited.status_code == status.HTTP_200_OK, edited.data

    def test_is_owner_is_exposed_in_the_page_detail(self, owner, collaborator, shared_page):
        assert client_for(owner).get(f'/api/pages/{shared_page.id}/').data['is_owner'] is True
        assert client_for(collaborator).get(f'/api/pages/{shared_page.id}/').data['is_owner'] is False

    def test_is_owner_cannot_be_set_from_the_payload(self, collaborator, shared_page):
        response = client_for(collaborator).put(
            f'/api/pages/{shared_page.id}/',
            {'name': shared_page.name, 'blocks': [], 'version': shared_page.version, 'is_owner': True},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_owner'] is False


# --- QA-013 ------------------------------------------------------------------

@pytest.mark.django_db
class TestThePublishedVersionCannotBeDeleted:
    def test_deleting_it_is_refused_and_the_public_page_stays_up(self, owner, shared_page, api_client):
        client = client_for(owner)
        client.post(f'/api/pages/{shared_page.id}/publish/')
        shared_page.refresh_from_db()
        published = shared_page.published_version
        client.post(versions_url(shared_page), {'label': 'newer'}, format='json')  # so it is not the last one

        response = client.delete(f'{versions_url(shared_page)}{published.id}/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'PUBLISHED_VERSION'
        assert PageVersion.objects.filter(pk=published.pk).exists()
        public = api_client.get(f'/api/public/pages/{shared_page.slug}/')
        assert public.status_code == status.HTTP_200_OK

    def test_other_versions_can_still_be_deleted(self, owner, shared_page):
        client = client_for(owner)
        client.post(f'/api/pages/{shared_page.id}/publish/')
        extra = client.post(versions_url(shared_page), {'label': 'draft'}, format='json')
        assert client.delete(f'{versions_url(shared_page)}{extra.data["id"]}/').status_code == 204

    def test_the_published_version_survives_the_plan_pruning_too(self, owner, shared_page):
        # (pre-existing rule, kept: the public copy is never pruned)
        client = client_for(owner)
        client.post(f'/api/pages/{shared_page.id}/publish/')
        shared_page.refresh_from_db()
        assert shared_page.versions.filter(pk=shared_page.published_version_id).exists()


# --- QA-101 ------------------------------------------------------------------

@pytest.mark.django_db
class TestUnshareWithMalformedInput:
    @pytest.mark.parametrize('user_id', ['not-a-uuid', '123', '', ' ', 'x' * 500])
    def test_a_bad_user_id_is_a_400_not_a_500(self, owner, shared_page, user_id):
        response = client_for(owner).post(f'/api/pages/{shared_page.id}/unshare/', {'user_id': user_id}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['code'] == 'BAD_REQUEST'

    def test_a_valid_uuid_of_a_non_collaborator_is_a_404(self, owner, shared_page, stranger):
        response = client_for(owner).post(
            f'/api/pages/{shared_page.id}/unshare/', {'user_id': str(stranger.pk)}, format='json',
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_a_collaborator_is_removed(self, owner, shared_page, collaborator):
        response = client_for(owner).post(
            f'/api/pages/{shared_page.id}/unshare/', {'user_id': str(collaborator.pk)}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert not shared_page.collaborators.filter(pk=collaborator.pk).exists()


# --- QA-103 ------------------------------------------------------------------

@pytest.mark.django_db
class TestPageSizeAndListCost:
    def test_a_page_has_at_most_100_blocks(self, auth_client, page):
        blocks = [{'type': 'cta', 'order': n, 'data': {'title': 'T'}, 'styles': {}} for n in range(101)]
        response = auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': blocks, 'version': page.version}, format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'blocks' in response.data['details']

    def test_100_blocks_are_accepted(self, auth_client, page):
        blocks = [{'type': 'cta', 'order': n, 'data': {'title': 'T'}, 'styles': {}} for n in range(100)]
        response = auth_client.put(
            f'/api/pages/{page.id}/', {'name': page.name, 'blocks': blocks, 'version': page.version}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK, response.data

    def test_the_list_counts_all_blocks_but_previews_only_the_first_four(self, auth_client, user):
        page = PageFactory(owner=user)
        for n in range(9):
            BlockFactory(page=page, type='cta', order=n, data={'title': f'B{n}'})
        other = PageFactory(owner=user)
        page.collaborators.add(UserFactory(), UserFactory())

        listed = auth_client.get('/api/pages/')

        by_id = {item['id']: item for item in listed.data['results']}
        assert by_id[str(page.id)]['block_count'] == 9
        assert [b['data']['title'] for b in by_id[str(page.id)]['preview_blocks']] == ['B0', 'B1', 'B2', 'B3']
        assert by_id[str(other.id)]['block_count'] == 0

    def test_the_list_runs_a_fixed_number_of_queries(self, auth_client, user, django_assert_max_num_queries):
        for _ in range(6):
            page = PageFactory(owner=user)
            for n in range(6):
                BlockFactory(page=page, type='cta', order=n)
        with django_assert_max_num_queries(8):
            assert auth_client.get('/api/pages/').status_code == 200

    def test_the_detail_still_returns_every_block(self, auth_client, user):
        page = PageFactory(owner=user)
        for n in range(9):
            BlockFactory(page=page, type='cta', order=n)
        assert len(auth_client.get(f'/api/pages/{page.id}/').data['blocks']) == 9


# --- QA-017 / QA-027: sharing by email ---------------------------------------

@pytest.mark.django_db
class TestShareByEmail:
    def test_the_email_lookup_ignores_case(self, owner, shared_page):
        target = UserFactory(email='friend@example.com')
        response = client_for(owner).post(
            f'/api/pages/{shared_page.id}/share/', {'email': 'Friend@Example.COM'}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert shared_page.collaborators.filter(pk=target.pk).exists()

    def test_user_values_are_escaped_in_the_html_email_and_the_subject_has_no_line_breaks(self, mailoutbox):
        owner = UserFactory(username='mallory')
        page = PageFactory(owner=owner, name='<a href="https://evil.test">y</a><img src=z>\nBcc: x@example.com')
        UserFactory(email='target@example.com')

        response = client_for(owner).post(
            f'/api/pages/{page.id}/share/', {'email': 'target@example.com'}, format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(mailoutbox) == 1
        message = mailoutbox[0]
        html_body = message.alternatives[0][0]
        assert '&lt;a href=&quot;https://evil.test&quot;&gt;y&lt;/a&gt;&lt;img src=z&gt;' in html_body
        assert '<img' not in html_body and 'href="https://evil.test"' not in html_body
        assert '\n' not in message.subject and '\r' not in message.subject
        assert 'Bcc: x@example.com' in message.subject  # kept as text on one line, not as a header
        assert not message.extra_headers.get('Bcc')
        assert not message.bcc

    def test_the_username_is_escaped_too(self, mailoutbox):
        owner = UserFactory(username='x<script>')
        page = PageFactory(owner=owner, name='Plain')
        UserFactory(email='target@example.com')
        client_for(owner).post(f'/api/pages/{page.id}/share/', {'email': 'target@example.com'}, format='json')
        html_body = mailoutbox[0].alternatives[0][0]
        assert '<script>' not in html_body
        assert 'x&lt;script&gt;' in html_body


# --- QA-029: snapshots of one page get distinct numbers ---------------------

@pytest.mark.django_db
def test_snapshots_in_a_row_get_consecutive_numbers(owner, shared_page):
    from pages.models import create_version_snapshot

    numbers = [create_version_snapshot(shared_page, owner, 'manual').version_number for _ in range(3)]
    assert numbers == [1, 2, 3]


@pytest.mark.django_db
def test_a_number_taken_by_a_concurrent_writer_is_retried(owner, shared_page):
    from django.db import IntegrityError
    from pages import models as page_models

    real = page_models._create_version_row
    attempts = []

    def collides_once(*args, **kwargs):
        attempts.append(1)
        if len(attempts) == 1:
            raise IntegrityError('UNIQUE constraint failed: pages_pageversion.page_id, version_number')
        return real(*args, **kwargs)

    with patch.object(page_models, '_create_version_row', side_effect=collides_once):
        version = page_models.create_version_snapshot(shared_page, owner, 'manual')

    assert len(attempts) == 2
    assert version.version_number == 1


@pytest.mark.django_db
def test_a_collision_that_keeps_happening_is_not_swallowed(owner, shared_page):
    from django.db import IntegrityError
    from pages import models as page_models

    with patch.object(page_models, '_create_version_row', side_effect=IntegrityError('again')):
        with pytest.raises(IntegrityError):
            page_models.create_version_snapshot(shared_page, owner, 'manual')

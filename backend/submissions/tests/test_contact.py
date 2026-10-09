import uuid

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from pages.models import Page
from submissions.models import FormSubmission
from tests.factories import BlockFactory, PageFactory, UserFactory

VALID = {'name': 'Ana', 'email': 'ana@example.com', 'message': 'Hola, quiero más información.'}


def url(slug):
    return f'/api/public/pages/{slug}/contact/'


def publish_with_contact(user, **page_kwargs):
    page = PageFactory(owner=user, **page_kwargs)
    block = BlockFactory(page=page, type='contact', order=0)
    page.publish(user)
    page.refresh_from_db()
    return page, block


@pytest.fixture
def published(user):
    return publish_with_contact(user)


@pytest.mark.django_db
class TestPublicContact:
    def test_stores_a_valid_submission(self, api_client, published):
        page, block = published
        resp = api_client.post(url(page.slug), {**VALID, 'block_id': str(block.id)}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        sub = FormSubmission.objects.get()
        assert sub.page == page
        assert sub.block_id == block.id
        assert (sub.name, sub.email) == ('Ana', 'ana@example.com')

    def test_block_id_is_optional(self, api_client, published):
        page, _ = published
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert FormSubmission.objects.get().block_id is None

    def test_strips_html_from_text(self, api_client, published):
        page, _ = published
        resp = api_client.post(url(page.slug), {
            **VALID,
            'name': '<b>Ana</b>',
            'message': '<script>alert(1)</script>Hola <img src=x onerror=alert(1)>',
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        sub = FormSubmission.objects.get()
        assert sub.name == 'Ana'
        assert '<' not in sub.message
        assert 'onerror' not in sub.message

    def test_does_not_need_credentials(self, published):
        page, _ = published
        client = APIClient()
        client.cookies['bp_access'] = 'garbage-token'
        resp = client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_201_CREATED

    @pytest.mark.parametrize('payload', [
        {**VALID, 'email': 'not-an-email'},
        {**VALID, 'name': ''},
        {**VALID, 'name': '<b></b>'},
        {**VALID, 'name': 'x' * 101},
        {**VALID, 'message': ''},
        {**VALID, 'message': 'x' * 2001},
        {'name': 'Ana'},
    ])
    def test_rejects_invalid_payload(self, api_client, published, payload):
        page, _ = published
        resp = api_client.post(url(page.slug), payload, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert 'error' in resp.data
        assert FormSubmission.objects.count() == 0

    def test_rejects_block_id_that_is_not_a_contact_block_of_the_snapshot(self, api_client, user):
        page, _ = publish_with_contact(user)
        hero = BlockFactory(page=page, type='hero', order=1)
        resp = api_client.post(url(page.slug), {**VALID, 'block_id': str(hero.id)}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'INVALID_BLOCK'
        resp = api_client.post(url(page.slug), {**VALID, 'block_id': str(uuid.uuid4())}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert FormSubmission.objects.count() == 0

    def test_draft_page_is_not_found(self, api_client, user):
        page = PageFactory(owner=user, status=Page.Status.DRAFT)
        BlockFactory(page=page, type='contact')
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'NOT_FOUND'

    def test_unpublished_page_is_not_found(self, api_client, published):
        page, _ = published
        page.unpublish()
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_published_status_without_frozen_version_is_not_found(self, api_client, user):
        page = PageFactory(owner=user, status=Page.Status.PUBLISHED)
        BlockFactory(page=page, type='contact')
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_page_whose_snapshot_has_no_contact_block_is_rejected(self, api_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='hero')
        page.publish(user)
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data['code'] == 'NO_CONTACT_FORM'

    def test_contact_block_added_after_publishing_does_not_count(self, api_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='hero')
        page.publish(user)
        BlockFactory(page=page, type='contact', order=5)
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_contact_block_removed_from_draft_still_counts_until_republished(self, api_client, published):
        page, block = published
        block.delete()
        resp = api_client.post(url(page.slug), VALID, format='json')
        assert resp.status_code == status.HTTP_201_CREATED

    def test_get_is_not_allowed(self, api_client, published):
        page, _ = published
        assert api_client.get(url(page.slug)).status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
class TestHoneypot:
    def test_filled_honeypot_gets_201_but_stores_nothing(self, api_client, published):
        page, _ = published
        resp = api_client.post(url(page.slug), {**VALID, 'website': 'http://spam.example'}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert FormSubmission.objects.count() == 0

    def test_honeypot_response_matches_a_real_acceptance(self, api_client, published):
        page, _ = published
        real = api_client.post(url(page.slug), VALID, format='json')
        trapped = api_client.post(url(page.slug), {**VALID, 'website': 'x'}, format='json')
        assert real.status_code == trapped.status_code
        assert real.data == trapped.data

    def test_filled_honeypot_with_invalid_payload_still_looks_accepted(self, api_client, published):
        page, _ = published
        resp = api_client.post(url(page.slug), {'website': 'x'}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert FormSubmission.objects.count() == 0

    def test_empty_honeypot_is_a_normal_submission(self, api_client, published):
        page, _ = published
        resp = api_client.post(url(page.slug), {**VALID, 'website': ''}, format='json')
        assert resp.status_code == status.HTTP_201_CREATED
        assert FormSubmission.objects.count() == 1


@pytest.mark.django_db
class TestOwnerSubmissions:
    def make(self, page, n=1, **kwargs):
        return [
            FormSubmission.objects.create(page=page, name=f'Person {i}', email=f'p{i}@example.com', message='Hi', **kwargs)
            for i in range(n)
        ]

    def test_owner_lists_newest_first(self, auth_client, page):
        first, second = self.make(page, 2)
        resp = auth_client.get(f'/api/pages/{page.id}/submissions/')
        assert resp.status_code == status.HTTP_200_OK
        assert [r['id'] for r in resp.data['results']] == [str(second.id), str(first.id)]
        assert resp.data['count'] == 2
        assert set(resp.data['results'][0]) == {'id', 'block_id', 'name', 'email', 'message', 'created_at'}

    def test_list_is_paginated(self, auth_client, page):
        self.make(page, 25)
        first = auth_client.get(f'/api/pages/{page.id}/submissions/')
        assert len(first.data['results']) == 20
        assert first.data['next'] is not None
        second = auth_client.get(f'/api/pages/{page.id}/submissions/?page=2')
        assert len(second.data['results']) == 5

    def test_only_this_pages_submissions(self, auth_client, user, page):
        self.make(page, 1)
        self.make(PageFactory(owner=user), 3)
        resp = auth_client.get(f'/api/pages/{page.id}/submissions/')
        assert resp.data['count'] == 1

    def test_requires_authentication(self, api_client, page):
        resp = api_client.get(f'/api/pages/{page.id}/submissions/')
        assert resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_other_user_gets_404_on_list_and_delete(self, page):
        (sub,) = self.make(page)
        stranger = APIClient()
        stranger.force_authenticate(user=UserFactory())
        assert stranger.get(f'/api/pages/{page.id}/submissions/').status_code == status.HTTP_404_NOT_FOUND
        resp = stranger.delete(f'/api/pages/{page.id}/submissions/{sub.id}/')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert FormSubmission.objects.filter(pk=sub.pk).exists()

    def test_collaborator_can_list_and_delete(self, page):
        (sub,) = self.make(page)
        collaborator = UserFactory()
        page.collaborators.add(collaborator)
        client = APIClient()
        client.force_authenticate(user=collaborator)
        assert client.get(f'/api/pages/{page.id}/submissions/').data['count'] == 1
        assert client.delete(f'/api/pages/{page.id}/submissions/{sub.id}/').status_code == status.HTTP_204_NO_CONTENT
        assert not FormSubmission.objects.exists()

    def test_owner_deletes_a_submission(self, auth_client, page):
        keep, drop = self.make(page, 2)
        resp = auth_client.delete(f'/api/pages/{page.id}/submissions/{drop.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert list(FormSubmission.objects.values_list('id', flat=True)) == [keep.id]

    def test_cannot_delete_a_submission_through_another_page(self, auth_client, user, page):
        other = PageFactory(owner=user)
        (sub,) = self.make(other)
        resp = auth_client.delete(f'/api/pages/{page.id}/submissions/{sub.id}/')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert FormSubmission.objects.filter(pk=sub.pk).exists()

    def test_deleting_the_page_deletes_its_submissions(self, page):
        self.make(page, 2)
        page.delete()
        assert FormSubmission.objects.count() == 0

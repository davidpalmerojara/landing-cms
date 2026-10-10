"""What the dashboard shows: owned vs shared pages (QA-051) and a search over every page (QA-016)."""
import pytest
from rest_framework import status
from rest_framework.test import APIClient

from billing.tests.test_billing_views import seed_billing
from pages.models import Page
from tests.factories import BlockFactory, PageFactory, UserFactory

pytestmark = pytest.mark.django_db


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class TestSubscriptionUsage:
    def test_qa051_shared_pages_do_not_count_as_owned(self, user):
        seed_billing(user)
        other = UserFactory()
        shared = PageFactory(owner=other)
        shared.collaborators.add(user)
        BlockFactory(page=shared, order=0)
        own = PageFactory(owner=user, status=Page.Status.PUBLISHED)
        BlockFactory(page=own, order=0)
        BlockFactory(page=own, order=1)
        PageFactory(owner=other)  # not visible to the user at all

        usage = client_for(user).get('/api/billing/subscription/').json()['usage']

        assert usage == {'pages': 1, 'visible_pages': 2, 'published_pages': 1, 'blocks': 3}

    def test_qa051_a_user_with_only_shared_pages_owns_none(self, user):
        seed_billing(user)
        for _ in range(3):
            PageFactory(owner=UserFactory()).collaborators.add(user)

        usage = client_for(user).get('/api/billing/subscription/').json()['usage']

        assert (usage['pages'], usage['visible_pages']) == (0, 3)


class TestPageSearch:
    def test_qa016_search_finds_pages_beyond_the_first_result_page(self, user):
        for index in range(25):
            PageFactory(owner=user, name=f'Landing {index}')
        PageFactory(owner=user, name='Needle in the haystack')

        everything = client_for(user).get('/api/pages/').json()
        found = client_for(user).get('/api/pages/', {'search': 'needle'}).json()

        assert everything['count'] == 26 and len(everything['results']) == 20
        assert found['count'] == 1
        assert found['results'][0]['name'] == 'Needle in the haystack'

    def test_qa016_search_also_matches_the_slug_and_stays_inside_the_users_pages(self, user):
        PageFactory(owner=user, name='Mine', slug='my-unique-slug')
        PageFactory(owner=UserFactory(), name='Not mine', slug='my-unique-slug-2')

        response = client_for(user).get('/api/pages/', {'search': 'unique-slug'})

        assert response.status_code == status.HTTP_200_OK
        assert [page['name'] for page in response.json()['results']] == ['Mine']

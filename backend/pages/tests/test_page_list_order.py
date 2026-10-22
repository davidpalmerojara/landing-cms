"""The dashboard list has an explicit order (CODE-003)."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.request import Request

from pages.models import Page
from pages.views import PageViewSet
from tests.factories import PageFactory


def _touch(page, minutes_ago):
    """Set updated_at directly: auto_now would overwrite it on save()."""
    Page.objects.filter(pk=page.pk).update(updated_at=timezone.now() - timedelta(minutes=minutes_ago))


@pytest.mark.django_db
class TestPageListOrder:
    def test_code003_the_list_queryset_is_ordered_despite_the_annotation(self, user, rf):
        """With a GROUP BY Django drops Meta.ordering: without order_by this was unordered
        and PostgreSQL returned rows in any order."""
        request = rf.get('/api/pages/')
        view = PageViewSet()
        view.request = Request(request)
        view.request.user = user
        view.action = 'list'
        view.kwargs = {}

        queryset = view.get_queryset()

        assert queryset.ordered
        assert 'ORDER BY' in str(queryset.query)

    def test_code003_most_recently_updated_first_and_pages_do_not_repeat(self, auth_client, user):
        pages = [PageFactory(owner=user, name=f'Page {i}') for i in range(25)]
        for index, page in enumerate(pages):
            _touch(page, minutes_ago=index)

        first = auth_client.get('/api/pages/?page=1&page_size=20').json()
        second = auth_client.get('/api/pages/?page=2&page_size=20').json()

        names = [p['name'] for p in first['results']] + [p['name'] for p in second['results']]
        assert names == [f'Page {i}' for i in range(25)]

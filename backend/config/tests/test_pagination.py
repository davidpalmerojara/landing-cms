"""APP2-011: paginated lists must not hand the backend's own host to the browser."""
import pytest

from config.pagination import site_relative
from tests.factories import PageFactory


def test_site_relative_keeps_only_the_path_and_query():
    assert site_relative('http://localhost:8001/api/pages/?page=2') == '/api/pages/?page=2'
    assert site_relative('https://internal.railway:8080/api/pages/') == '/api/pages/'
    assert site_relative(None) is None


@pytest.mark.django_db
def test_the_page_list_links_are_relative(auth_client, user):
    for index in range(25):
        PageFactory(owner=user, name=f'Page {index}')

    first = auth_client.get('/api/pages/', HTTP_HOST='localhost:8001')
    second = auth_client.get('/api/pages/?page=2', HTTP_HOST='localhost:8001')

    assert first.data['next'] == '/api/pages/?page=2'
    assert first.data['previous'] is None
    assert second.data['next'] is None
    assert second.data['previous'] == '/api/pages/'

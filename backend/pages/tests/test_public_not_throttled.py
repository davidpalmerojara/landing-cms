"""QA-006: the public page endpoints are not rate limited.

Their only client is the Next server (one IP) and Next caches what they answer:
the 60/min anonymous limit let a bot sending unknown slugs turn every published
page into a 500.
"""
import pytest
from rest_framework import status
from rest_framework.throttling import SimpleRateThrottle

from tests.factories import BlockFactory, PageFactory


@pytest.fixture(autouse=True)
def production_anonymous_limit(monkeypatch):
    """conftest disables throttling; these tests are about the real 60/min anonymous limit."""
    monkeypatch.setattr(SimpleRateThrottle, 'THROTTLE_RATES', {'anon': '60/minute', 'user': '120/minute'})


@pytest.fixture
def slug(user):
    page = PageFactory(owner=user)
    BlockFactory(page=page, type='hero', data={'title': 'Hi'})
    page.publish(user)
    return page.slug


@pytest.mark.django_db
class TestNoThrottle:
    def test_a_hundred_requests_for_unknown_slugs_never_get_429(self, api_client, slug):
        codes = {api_client.get(f'/api/public/pages/nothing-{n}/').status_code for n in range(100)}
        assert codes == {status.HTTP_404_NOT_FOUND}
        assert api_client.get(f'/api/public/pages/{slug}/').status_code == status.HTTP_200_OK

    def test_a_published_page_stays_available_after_a_hundred_requests(self, api_client, slug):
        codes = {api_client.get(f'/api/public/pages/{slug}/').status_code for _ in range(100)}
        assert codes == {status.HTTP_200_OK}

    def test_the_sitemap_endpoints_are_not_throttled_either(self, api_client, slug):
        for url in ('/api/public/sitemap-data/', '/api/sitemap/'):
            codes = {api_client.get(url).status_code for _ in range(70)}
            assert codes == {status.HTTP_200_OK}, url

import pytest
from rest_framework.test import APIClient
from tests.factories import UserFactory, WorkspaceFactory, PageFactory, BlockFactory


@pytest.fixture(autouse=True)
def disable_throttling(settings):
    """Disable rate limiting in tests by setting very high limits."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {
            'anon': '10000/minute',
            'user': '10000/minute',
            'auth': '10000/minute',
            'login_username': '10000/minute',
            'contact': '10000/minute',
        },
    }


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def workspace(user):
    return WorkspaceFactory(owner=user)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(user):
    """Authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def page(user):
    return PageFactory(owner=user)


@pytest.fixture
def page_with_blocks(user):
    page = PageFactory(owner=user)
    BlockFactory(page=page, type='hero', order=0)
    BlockFactory(page=page, type='features', order=1)
    BlockFactory(page=page, type='cta', order=2)
    return page


@pytest.fixture(autouse=True)
def clear_cache():
    """Rate-limit counters live in the cache; each test starts from zero."""
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def no_external_secrets(settings):
    """Tests must behave the same on any machine as in CI: never pick up API
    keys from a developer's .env. Tests that need one set it explicitly."""
    settings.GOOGLE_AI_KEY = ''
    settings.ANTHROPIC_API_KEY = ''
    settings.STRIPE_SECRET_KEY = ''
    settings.GOOGLE_CLIENT_ID = ''
    settings.REVALIDATE_SECRET = ''

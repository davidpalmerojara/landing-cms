"""Publishing, unpublishing or deleting a page drops the frontend's cached copy (ADR-019)."""
import json
import urllib.error
from unittest.mock import patch

import pytest
from rest_framework import status

from pages.models import Page
from tests.factories import PageFactory

GET_PLAN = 'billing.permissions.get_user_plan'
URLOPEN = 'pages.revalidation.urllib.request.urlopen'


class _Plan:
    name = 'pro'
    max_version_history = 50
    remove_watermark = True


@pytest.fixture
def revalidation_on(settings):
    settings.REVALIDATE_SECRET = 'test-secret'
    settings.FRONTEND_URL = 'http://frontend.test/'


def sent_requests(urlopen):
    return [call.args[0] for call in urlopen.call_args_list]


@pytest.mark.django_db
class TestRevalidation:
    @pytest.mark.parametrize('action', ['publish', 'unpublish'])
    @patch(GET_PLAN, return_value=_Plan())
    def test_publish_and_unpublish_revalidate_the_page(
        self, _plan, action, revalidation_on, auth_client, user, django_capture_on_commit_callbacks,
    ):
        page = PageFactory(owner=user, slug='mi-landing')
        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            resp = auth_client.post(f'/api/pages/{page.id}/{action}/')

        assert resp.status_code == status.HTTP_200_OK
        [request] = sent_requests(urlopen)
        assert request.full_url == 'http://frontend.test/revalidate'
        assert request.get_header('X-revalidate-secret') == 'test-secret'
        assert json.loads(request.data) == {'slugs': ['mi-landing']}

    def test_delete_revalidates_the_page(self, revalidation_on, auth_client, user, django_capture_on_commit_callbacks):
        page = PageFactory(owner=user, slug='borrada')
        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            resp = auth_client.delete(f'/api/pages/{page.id}/')

        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert json.loads(sent_requests(urlopen)[0].data) == {'slugs': ['borrada']}

    @patch(GET_PLAN, return_value=_Plan())
    def test_frontend_down_does_not_break_publishing(
        self, _plan, revalidation_on, auth_client, user, django_capture_on_commit_callbacks,
    ):
        page = PageFactory(owner=user)
        failure = urllib.error.URLError('connection refused')
        with patch(URLOPEN, side_effect=failure), django_capture_on_commit_callbacks(execute=True):
            resp = auth_client.post(f'/api/pages/{page.id}/publish/')

        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.status == Page.Status.PUBLISHED

    @patch(GET_PLAN, return_value=_Plan())
    def test_nothing_is_sent_without_a_secret(self, _plan, auth_client, user, django_capture_on_commit_callbacks):
        page = PageFactory(owner=user)
        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            auth_client.post(f'/api/pages/{page.id}/publish/')

        urlopen.assert_not_called()

    @patch(GET_PLAN, return_value=_Plan())
    def test_saving_a_draft_does_not_revalidate(self, _plan, revalidation_on, auth_client, user, django_capture_on_commit_callbacks):
        page = PageFactory(owner=user)
        with patch(URLOPEN) as urlopen, django_capture_on_commit_callbacks(execute=True):
            auth_client.put(f'/api/pages/{page.id}/', {'name': 'Nuevo nombre', 'blocks': [], 'version': page.version}, format='json')

        urlopen.assert_not_called()

"""Launch review: email that a free plan and a blocked SMTP port can survive.

DEPLOY-003: an SMTP failure was a 500 (HTML) and the token still counted
against the address; a blocked port hung the request.
SEC-003: the share endpoint mailed attacker-written text to any address, again
and again, and told whether the address had an account; magic links could use
up the provider's daily quota.
"""
import logging
from unittest.mock import MagicMock, patch

import pytest
import requests
from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.brevo import BREVO_SEND_URL, BrevoEmailBackend, BrevoError, brevo_payload
from accounts.checks import check_email_backend
from accounts.mailing import prune_sent_emails, recipient_hash
from accounts.models import MagicToken, SentEmail
from tests.factories import PageFactory, UserFactory

MAGIC_URL = '/api/auth/magic/request/'
pytestmark = pytest.mark.django_db


def ask_for_link(email='someone@example.com', **extra):
    return APIClient().post(MAGIC_URL, {'email': email}, format='json', **extra)


class TestMagicLinkSendIsGuarded:
    def test_deploy_003_a_provider_failure_is_a_json_503_and_no_token_is_kept(self, caplog):
        with patch('accounts.mailing.send_mail', side_effect=ConnectionRefusedError('port 587 blocked')):
            with caplog.at_level(logging.ERROR, logger='accounts.mailing'):
                response = ask_for_link()

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response['Content-Type'].startswith('application/json')
        assert response.data['code'] == 'EMAIL_UNAVAILABLE'
        assert MagicToken.objects.count() == 0
        assert SentEmail.objects.count() == 0
        assert 'Sending a magic_link email failed' in caplog.text

    def test_deploy_003_failures_do_not_use_up_the_addresss_quota(self, settings):
        settings.MAGIC_LINK_EMAIL_LIMIT = 3
        with patch('accounts.mailing.send_mail', side_effect=TimeoutError()):
            for _ in range(4):
                assert ask_for_link().status_code == status.HTTP_503_SERVICE_UNAVAILABLE

        assert ask_for_link().status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 1

    def test_the_previous_link_stops_working_only_once_the_new_one_went_out(self):
        assert ask_for_link().status_code == status.HTTP_200_OK
        first = MagicToken.objects.get()
        with patch('accounts.mailing.send_mail', side_effect=OSError()):
            ask_for_link()
        first.refresh_from_db()
        assert first.used is False

        ask_for_link()
        first.refresh_from_db()
        assert first.used is True
        assert MagicToken.objects.filter(used=False).count() == 1

    def test_email_turned_off_answers_503_at_once(self, settings):
        settings.EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'
        response = ask_for_link()
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data['code'] == 'EMAIL_UNAVAILABLE'
        assert MagicToken.objects.count() == 0

    def test_sec_003_the_global_daily_cap_stops_every_send(self, settings, caplog):
        settings.EMAIL_DAILY_LIMIT = 2
        assert ask_for_link('a@example.com').status_code == status.HTTP_200_OK
        assert ask_for_link('b@example.com').status_code == status.HTTP_200_OK

        with caplog.at_level(logging.ERROR, logger='accounts.mailing'):
            response = ask_for_link('c@example.com')

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert len(mail.outbox) == 2
        assert 'Daily email limit reached' in caplog.text

    def test_sec_003_one_address_gets_at_most_its_daily_emails(self, settings):
        settings.EMAIL_RECIPIENT_DAILY_LIMIT = 2
        settings.MAGIC_LINK_EMAIL_LIMIT = 10
        answers = [ask_for_link('victim@example.com').status_code for _ in range(4)]

        # Same answer every time: the caller cannot tell, the inbox is not flooded
        assert answers == [status.HTTP_200_OK] * 4
        assert len(mail.outbox) == 2
        assert MagicToken.objects.count() == 2

    def test_only_a_hash_of_the_address_is_stored(self):
        ask_for_link('Person@Example.com')
        sent = SentEmail.objects.get()
        assert sent.kind == SentEmail.Kind.MAGIC_LINK
        assert sent.recipient_hash == recipient_hash('person@example.com')
        assert 'example' not in sent.recipient_hash

    def test_old_records_are_pruned(self):
        from datetime import timedelta
        from django.utils import timezone

        old = SentEmail.objects.create(kind=SentEmail.Kind.MAGIC_LINK, recipient_hash='x')
        SentEmail.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=31))
        SentEmail.objects.create(kind=SentEmail.Kind.MAGIC_LINK, recipient_hash='y')

        assert prune_sent_emails() == 1
        assert list(SentEmail.objects.values_list('recipient_hash', flat=True)) == ['y']


@pytest.fixture
def owner():
    return UserFactory(username='owner')


@pytest.fixture
def owner_client(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


def share(client, page, email):
    return client.post(f'/api/pages/{page.pk}/share/', {'email': email}, format='json')


class TestShareNotices:
    def test_sec_003_the_answer_is_the_same_with_or_without_an_account(self, owner_client, owner):
        page = PageFactory(owner=owner)
        UserFactory(email='exists@example.com')

        known = share(owner_client, page, 'exists@example.com')
        unknown = share(owner_client, page, 'nobody@example.com')

        assert known.status_code == unknown.status_code == status.HTTP_200_OK
        assert known.data == unknown.data

    def test_sec_003_sharing_twice_sends_one_email(self, owner_client, owner):
        page = PageFactory(owner=owner)
        UserFactory(email='friend@example.com')

        share(owner_client, page, 'friend@example.com')
        share(owner_client, page, 'friend@example.com')
        # Removed and added again: still one notice for this page
        friend = page.collaborators.get()
        owner_client.post(f'/api/pages/{page.pk}/unshare/', {'user_id': str(friend.pk)}, format='json')
        share(owner_client, page, 'friend@example.com')

        assert len(mail.outbox) == 1

    def test_sec_003_an_unverified_address_gets_no_email_but_is_added(self, owner_client, owner):
        page = PageFactory(owner=owner)
        squatter = UserFactory(email='victim@example.com', email_verified=False)

        share(owner_client, page, 'victim@example.com')

        assert mail.outbox == []
        assert page.collaborators.filter(pk=squatter.pk).exists()

    def test_sec_003_one_address_gets_at_most_its_daily_notices(self, settings, owner_client, owner):
        settings.EMAIL_RECIPIENT_DAILY_LIMIT = 2
        UserFactory(email='friend@example.com')
        for _ in range(4):
            share(owner_client, PageFactory(owner=owner), 'friend@example.com')
        assert len(mail.outbox) == 2

    def test_a_failed_notice_still_shares(self, owner_client, owner):
        page = PageFactory(owner=owner)
        friend = UserFactory(email='friend@example.com')
        with patch('accounts.mailing.send_mail', side_effect=OSError('down')):
            response = share(owner_client, page, 'friend@example.com')
        assert response.status_code == status.HTTP_200_OK
        assert page.collaborators.filter(pk=friend.pk).exists()


class TestBrevoBackend:
    def message(self):
        email = EmailMultiAlternatives(
            subject='Asunto', body='Texto', from_email='Paxl <noreply@paxl.test>', to=['person@example.com'],
        )
        email.attach_alternative('<p>HTML</p>', 'text/html')
        return email

    def test_payload(self):
        assert brevo_payload(self.message()) == {
            'sender': {'email': 'noreply@paxl.test', 'name': 'Paxl'},
            'to': [{'email': 'person@example.com'}],
            'subject': 'Asunto',
            'textContent': 'Texto',
            'htmlContent': '<p>HTML</p>',
        }

    def test_sends_one_https_request_with_the_key_and_the_timeout(self):
        with patch('accounts.brevo.requests.post', return_value=MagicMock(status_code=201)) as post:
            sent = BrevoEmailBackend(api_key='brevo-key', timeout=7).send_messages([self.message()])

        assert sent == 1
        assert post.call_args.args == (BREVO_SEND_URL,)
        assert post.call_args.kwargs['headers']['api-key'] == 'brevo-key'
        assert post.call_args.kwargs['timeout'] == 7

    def test_a_refusal_raises(self):
        with patch('accounts.brevo.requests.post', return_value=MagicMock(status_code=401, text='unauthorized')):
            with pytest.raises(BrevoError):
                BrevoEmailBackend(api_key='bad').send_messages([self.message()])

    def test_a_timeout_raises_unless_silent(self):
        with patch('accounts.brevo.requests.post', side_effect=requests.Timeout()):
            with pytest.raises(requests.Timeout):
                BrevoEmailBackend(api_key='k').send_messages([self.message()])
            assert BrevoEmailBackend(api_key='k', fail_silently=True).send_messages([self.message()]) == 0

    @override_settings(EMAIL_BACKEND='accounts.brevo.BrevoEmailBackend', BREVO_API_KEY='k')
    def test_a_magic_link_through_brevo_that_times_out_is_a_503(self):
        with patch('accounts.brevo.requests.post', side_effect=requests.Timeout()):
            response = ask_for_link()
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert MagicToken.objects.count() == 0


class TestEmailChecks:
    def test_sec_003_console_backend_with_debug_off_is_an_error(self, settings):
        settings.DEBUG = False
        settings.EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
        assert [e.id for e in check_email_backend(None)] == ['paxl.E004']

    def test_console_backend_in_development_is_fine(self, settings):
        settings.DEBUG = True
        settings.EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
        assert check_email_backend(None) == []

    def test_brevo_without_a_key_is_an_error(self, settings):
        settings.DEBUG = False
        settings.EMAIL_BACKEND = 'accounts.brevo.BrevoEmailBackend'
        settings.BREVO_API_KEY = ''
        assert [e.id for e in check_email_backend(None)] == ['paxl.E005']

    def test_email_turned_off_is_allowed(self, settings):
        settings.DEBUG = False
        settings.EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'
        assert check_email_backend(None) == []

    def test_the_default_timeout_is_ten_seconds(self):
        import config.settings as project_settings
        assert project_settings.EMAIL_TIMEOUT == 10

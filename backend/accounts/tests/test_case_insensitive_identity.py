"""Email and username ignore case (D8, QA-017), and the answers follow Accept-Language (QA-054)."""
import importlib

import pytest
from django.core import mail
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import MagicToken, User
from tests.factories import MagicTokenFactory, UserFactory

pytestmark = pytest.mark.django_db

PASSWORD = 'Str0ngP@ss!'


def register(client, language=None, **fields):
    data = {'username': 'newuser', 'email': 'new@example.com', 'password': PASSWORD, 'password2': PASSWORD, **fields}
    extra = {'HTTP_ACCEPT_LANGUAGE': language} if language else {}
    return client.post('/api/auth/register/', data, format='json', **extra)


class TestRegistration:
    def test_qa017_an_email_that_differs_only_by_case_is_rejected(self):
        UserFactory(email='demo@example.com')

        resp = register(APIClient(), email='Demo@Example.com')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in resp.data['details']

    def test_qa017_a_username_that_differs_only_by_case_is_rejected(self):
        UserFactory(username='demo')

        resp = register(APIClient(), username='DEMO')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'username' in resp.data['details']

    def test_qa017_the_email_is_stored_in_lower_case(self):
        resp = register(APIClient(), email='  Mixed.Case@Example.COM ')

        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['user']['email'] == 'mixed.case@example.com'
        assert User.objects.get(username='newuser').email == 'mixed.case@example.com'

    def test_qa054_both_errors_come_back_together(self):
        UserFactory(username='taken', email='taken@example.com')

        resp = register(APIClient(), username='Taken', email='TAKEN@example.com')

        assert set(resp.data['details']) == {'username', 'email'}

    def test_qa054_messages_follow_accept_language(self):
        UserFactory(email='dup@example.com')

        spanish = register(APIClient(), email='dup@example.com', language='es')
        english = register(APIClient(), email='dup@example.com', language='en')

        assert spanish.data['details']['email'] == ['Ya existe una cuenta con este email.']
        assert english.data['details']['email'] == ['An account with this email already exists.']

    def test_qa054_django_validators_are_translated_too(self):
        short = register(APIClient(), password='abc', password2='abc', language='en')
        assert any('too short' in message for message in short.data['details']['password'])


class TestSignIn:
    def test_qa017_login_ignores_the_case_of_the_username(self):
        UserFactory(username='Demo')

        resp = APIClient().post('/api/auth/login/', {'username': 'dEMO', 'password': 'testpass123'}, format='json')

        assert resp.status_code == status.HTTP_200_OK

    def test_a_wrong_password_still_fails(self):
        UserFactory(username='Demo')

        resp = APIClient().post('/api/auth/login/', {'username': 'demo', 'password': 'nope'}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_qa017_a_magic_link_for_another_casing_signs_into_the_existing_account(self):
        existing = UserFactory(email='magic@example.com')
        MagicTokenFactory(email='MAGIC@Example.com', token='token-upper')

        resp = APIClient().post('/api/auth/magic/verify/', {'token': 'token-upper'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['user']['id'] == str(existing.pk)
        assert User.objects.count() == 1

    def test_qa017_requesting_a_link_with_capitals_stores_the_lower_case_address(self):
        UserFactory(email='magic@example.com')

        resp = APIClient().post('/api/auth/magic/request/', {'email': 'MAGIC@Example.com'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert MagicToken.objects.get().email == 'magic@example.com'
        assert mail.outbox[0].to == ['magic@example.com']

    def test_qa054_the_magic_link_email_is_in_the_language_of_the_request(self):
        APIClient().post('/api/auth/magic/request/', {'email': 'a@example.com'}, format='json', HTTP_ACCEPT_LANGUAGE='en')
        APIClient().post('/api/auth/magic/request/', {'email': 'b@example.com'}, format='json', HTTP_ACCEPT_LANGUAGE='es')

        english, spanish = mail.outbox
        assert english.subject == 'Your Paxl sign-in link'
        assert 'expires in 15 minutes' in english.body
        assert spanish.subject == 'Tu enlace de acceso a Paxl'


class TestDatabaseConstraints:
    def test_qa017_the_database_refuses_two_emails_that_differ_by_case(self):
        UserFactory(email='a@example.com')

        with pytest.raises(IntegrityError), transaction.atomic():
            User.objects.bulk_create([User(username='other', email='A@EXAMPLE.COM')])

    def test_qa017_the_database_refuses_two_usernames_that_differ_by_case(self):
        UserFactory(username='Name')

        with pytest.raises(IntegrityError), transaction.atomic():
            User.objects.bulk_create([User(username='NAME', email='other@example.com')])

    def test_saving_a_user_lower_cases_the_email(self):
        user = UserFactory(email='Caps@Example.com')
        user.refresh_from_db()
        assert user.email == 'caps@example.com'


class TestGoogleSignIn:
    def test_qa017_google_matches_an_existing_account_ignoring_case(self, settings):
        from unittest.mock import patch

        settings.GOOGLE_CLIENT_ID = 'client-id'
        existing = UserFactory(email='person@example.com')
        info = {'sub': 'g-1', 'email': 'Person@Example.com', 'email_verified': True}

        with patch('accounts.views.google_id_token.verify_oauth2_token', return_value=info):
            resp = APIClient().post('/api/auth/google/', {'token': 'x'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['user']['id'] == str(existing.pk)
        assert User.objects.count() == 1


class TestDeletedAccountsRefreshToken:
    def test_qa101_a_refresh_token_of_a_deleted_user_is_a_401_not_a_500(self):
        user = UserFactory(username='gone')
        client = APIClient()
        client.post('/api/auth/login/', {'username': 'gone', 'password': 'testpass123'}, format='json')
        # Deleted by plain ORM delete, as the admin does: the signed token is still valid
        User.objects.filter(pk=user.pk).delete()

        resp = client.post('/api/auth/refresh/', {}, format='json')

        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert resp.data['code'] == 'INVALID_REFRESH_TOKEN'


class FakeManager:
    """Stands in for the historical User model: the real database refuses the duplicates the migration looks for."""

    def __init__(self, rows):
        self.rows = rows

    @property
    def objects(self):
        return self

    def exclude(self, **excluded):
        field, value = next(iter(excluded.items()))
        return FakeManager([row for row in self.rows if row[field] != value])

    def values_list(self, field, flat=False):
        return [row[field] for row in self.rows]


class FakeApps:
    def __init__(self, rows):
        self.rows = rows

    def get_model(self, app, model):
        return FakeManager(self.rows)


class TestMigration:
    """0009 stops with the colliding accounts listed, and lower-cases the rest."""

    migration = importlib.import_module('accounts.migrations.0009_case_insensitive_identity')

    def test_qa017_it_stops_and_lists_accounts_that_differ_only_by_case(self):
        rows = [
            {'username': 'dupmail', 'email': 'Dup@example.com'},
            {'username': 'dupmail2', 'email': 'dup@example.com'},
            {'username': 'DEMO', 'email': 'demo1@example.com'},
            {'username': 'demo', 'email': 'demo2@example.com'},
        ]

        with pytest.raises(RuntimeError) as failure:
            self.migration.refuse_duplicates(FakeApps(rows), None)

        text = str(failure.value)
        assert 'email "dup@example.com": Dup@example.com, dup@example.com' in text
        assert 'username "demo": DEMO, demo' in text
        assert 'run the migration again' in text

    def test_qa017_clean_data_passes_the_check(self):
        rows = [{'username': 'a', 'email': 'a@example.com'}, {'username': 'b', 'email': 'b@example.com'}]

        self.migration.refuse_duplicates(FakeApps(rows), None)

    def test_qa017_it_lower_cases_emails_of_users_and_pending_magic_links(self):
        before = MigrationExecutor(connection).loader.project_state([('accounts', '0008_user_is_guest')]).apps
        OldUser = before.get_model('accounts', 'User')
        OldMagicToken = before.get_model('accounts', 'MagicToken')
        OldUser.objects.create(username='mixed', email='Mixed@Example.com')
        OldMagicToken.objects.create(email='Mixed@Example.com', token='t-1')

        self.migration.lowercase_emails(before, None)

        assert OldUser.objects.get(username='mixed').email == 'mixed@example.com'
        assert OldMagicToken.objects.get(token='t-1').email == 'mixed@example.com'

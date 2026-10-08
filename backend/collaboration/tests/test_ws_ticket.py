import asyncio

import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework import status

from collaboration.middleware import get_user_from_ticket, ticket_from_scope


@pytest.mark.django_db(transaction=True)
class TestWsTicket:
    def test_requires_a_session(self, api_client):
        assert api_client.post('/api/auth/ws-ticket/').status_code == status.HTTP_401_UNAUTHORIZED

    def test_ticket_identifies_the_user_exactly_once(self, auth_client, user):
        ticket = auth_client.post('/api/auth/ws-ticket/').data['ticket']

        assert asyncio.run(get_user_from_ticket(ticket)) == user
        replay = asyncio.run(get_user_from_ticket(ticket))
        assert isinstance(replay, AnonymousUser)

    def test_unknown_ticket_is_anonymous(self):
        assert isinstance(asyncio.run(get_user_from_ticket('made-up')), AnonymousUser)


def test_ticket_is_read_from_the_query_string():
    assert ticket_from_scope({'query_string': b'ticket=abc123'}) == 'abc123'
    assert ticket_from_scope({'query_string': b''}) is None

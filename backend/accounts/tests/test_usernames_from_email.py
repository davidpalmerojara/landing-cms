"""SEC3-005: accounts created by magic link or Google follow the same ASCII
username rule as register and guest claim."""
import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch

from accounts.models import User
from accounts.serializers import ASCII_USERNAME, username_base_from_email
from tests.factories import MagicTokenFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(('email', 'expected'), [
    ('plain@example.com', 'plain'),
    ('first.last-name_1@example.com', 'first.last-name_1'),
    ('r3+tag@example.com', 'r3_tag'),
    ("o'brien@example.com", 'o_brien'),
    ('a!b#c$d%e&f*g/h=i?j^k{l|m}n~o@example.com', 'a_b_c_d_e_f_g_h_i_j_k_l_m_n_o'),
    ('josé@example.com', 'jos_'),
    ('ｄｅｍｏ@example.com', '____'),
    ('x' * 40 + '@example.com', 'x' * 30),
    ('@example.com', 'user'),
])
def test_username_base_from_email(email, expected):
    assert username_base_from_email(email) == expected
    assert ASCII_USERNAME.fullmatch(expected)


def test_magic_link_sign_up_with_odd_characters_gets_an_ascii_username():
    MagicTokenFactory(email="r3+tag'x@example.com", token='odd-token')

    resp = APIClient().post('/api/auth/magic/verify/', {'token': 'odd-token'}, format='json')

    assert resp.status_code == status.HTTP_200_OK
    assert User.objects.get(email="r3+tag'x@example.com").username == 'r3_tag_x'


def test_magic_link_username_stays_unique_ignoring_case():
    UserFactory(username='R3_Tag', email='other@example.com')
    MagicTokenFactory(email='r3+tag@example.com', token='dup-token')

    resp = APIClient().post('/api/auth/magic/verify/', {'token': 'dup-token'}, format='json')

    assert resp.status_code == status.HTTP_200_OK
    username = User.objects.get(email='r3+tag@example.com').username
    assert username != 'r3_tag' and username.startswith('r3_tag_')
    assert ASCII_USERNAME.fullmatch(username)


@override_settings(GOOGLE_CLIENT_ID='google-client-id')
@patch('accounts.views.google_id_token.verify_oauth2_token', return_value={
    'sub': 'google-sub-odd', 'email': 'ana+news@example.com', 'email_verified': True,
})
def test_google_sign_up_gets_an_ascii_username(_verify, api_client):
    resp = api_client.post('/api/auth/google/', {'token': 'valid'}, format='json')

    assert resp.status_code == status.HTTP_200_OK
    assert User.objects.get(email='ana+news@example.com').username == 'ana_news'

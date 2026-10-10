"""Saving a page again must never change what is stored.

Sanitizing runs once per field (the field's rule does it) and every sanitizer
gives the same output when it is fed its own output.
"""
import random

import pytest

from pages.block_sanitizers import sanitize_custom_html, sanitize_plain_text
from pages.block_validators import clean_block_data

TRICKY = ['&lt;', '&amp;lt;', '&amp;amp;', '<b>', 'a & b', '5 < 6', '<10ms', '&lt;b&gt;bold&lt;/b&gt;',
          '&#60;', '&copy', 'Tom &amp; Jerry', '<<b>script>alert(1)<</b>/script>', '<p>Hi</p> & <em>you</em>']


def _random_markup(rng):
    pieces = ['<', '>', '&', ';', '/', 'a', 'b', ' ', '=', '"', 'lt', 'amp', 'gt', '#60', 'script', 'strong', 'p']
    return ''.join(rng.choice(pieces) for _ in range(rng.randint(0, 24)))


@pytest.mark.parametrize('sanitize', [sanitize_plain_text, sanitize_custom_html])
class TestSanitizersAreIdempotent:
    @pytest.mark.parametrize('text', TRICKY)
    def test_tricky_inputs(self, sanitize, text):
        once = sanitize(text)
        assert sanitize(once) == once

    def test_random_markup(self, sanitize):
        rng = random.Random(20261010)
        for _ in range(500):
            once = sanitize(_random_markup(rng))
            assert sanitize(once) == once


class TestPlainTextKeepsWhatWasTyped:
    @pytest.mark.parametrize('typed, stored', [
        ('&lt;', '&lt;'),
        ('&amp;lt;', '&amp;lt;'),
        ('&#60;', '&#60;'),
        ('a & b', 'a & b'),
        ('5 < 6', '5 < 6'),
        ('<10ms', '<10ms'),
        ('<b>bold</b>', 'bold'),
    ])
    def test_entities_are_not_decoded(self, typed, stored):
        assert sanitize_plain_text(typed) == stored

    def test_markup_that_only_appears_after_stripping_is_removed_too(self):
        cleaned = sanitize_plain_text('<<b>script>alert(1)<</b>/script>')
        assert '<script' not in cleaned and '</script' not in cleaned

    def test_non_strings_pass_through(self):
        assert sanitize_plain_text(5) == 5
        assert sanitize_plain_text(None) is None


class TestSanitizedOncePerField:
    @pytest.mark.parametrize('text', TRICKY)
    @pytest.mark.parametrize('block_type, build', [
        ('hero', lambda text: {'title': text}),
        ('cta', lambda text: {'title': text, 'subtitle': text}),
        ('stats', lambda text: {'stats': [{'value': text, 'label': text}]}),
    ])
    def test_clean_block_data_twice_equals_once(self, block_type, build, text):
        once = clean_block_data(block_type, build(text))
        assert clean_block_data(block_type, once) == once

    def test_top_level_plain_field_is_not_decoded_twice(self):
        # A single pass: the old double pass turned '&amp;lt;' into '<'
        assert clean_block_data('hero', {'title': '&amp;lt;'}) == {'title': '&amp;lt;'}


def _block(block_type, data):
    return {'type': block_type, 'data': data, 'styles': {}}


@pytest.mark.django_db
class TestSavingTwiceThroughTheApi:
    def test_the_stored_value_does_not_change_between_saves(self, auth_client, page):
        blocks = [
            _block('hero', {'title': text, 'subtitle': text}) for text in TRICKY
        ] + [
            _block('cta', {'title': text, 'subtitle': text}) for text in TRICKY
        ] + [
            _block('stats', {'stats': [{'value': text, 'label': text} for text in TRICKY[:6]]}),
        ]
        url = f'/api/pages/{page.id}/'

        first = auth_client.put(url, {'name': page.name, 'blocks': blocks, 'version': page.version}, format='json')
        assert first.status_code == 200, first.data
        stored_once = [block['data'] for block in first.data['blocks']]

        # What the editor does next: send back what the server gave it
        second = auth_client.put(
            url,
            {'name': page.name, 'blocks': first.data['blocks'], 'version': first.data['version']},
            format='json',
        )
        assert second.status_code == 200, second.data
        third = auth_client.put(
            url,
            {'name': page.name, 'blocks': second.data['blocks'], 'version': second.data['version']},
            format='json',
        )
        assert third.status_code == 200, third.data

        assert [block['data'] for block in second.data['blocks']] == stored_once
        assert [block['data'] for block in third.data['blocks']] == stored_once

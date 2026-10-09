"""AI generation asks for arrays and saves them through the same validation as the API."""
import json
import re
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import status

from ai_generation.block_schemas import BLOCK_SCHEMAS, build_schema_reference
from ai_generation.prompts import get_edit_block_system_prompt, get_system_prompt
from ai_generation.validators import (
    BlockValidationError,
    finalize_blocks,
    sanitize_blocks,
    validate_blocks,
)
from pages.block_validators import BLOCK_VALIDATORS, clean_block_data
from tests.factories import BlockFactory, PageFactory

GET_PLAN = 'billing.permissions.get_user_plan'
RESOLVE_PROVIDER = 'ai_generation.views.resolve_provider'
CALL_AI = 'ai_generation.views.call_ai'

NUMBERED_KEY = re.compile(r'"(?:(?:feature|quote|author|role|plan|logo|image|member|stat|item|link)\d\w*|[qa]\d)"')

LIST_KEYS = {
    'navbar': 'links', 'footer': 'links', 'features': 'features', 'testimonials': 'testimonials',
    'pricing': 'plans', 'faq': 'questions', 'logoCloud': 'logos', 'gallery': 'images', 'team': 'members',
    'stats': 'stats', 'timeline': 'events',
}


def plan():
    return SimpleNamespace(
        name='pro', display_name='Pro', max_pages=100, max_version_history=50,
        max_ai_generations_per_hour=10, has_custom_domain=True, has_analytics=True, remove_watermark=True,
    )


def few_shot_responses(prompt):
    """The JSON arrays of the 'Response:' sections of the system prompt."""
    decoder = json.JSONDecoder()
    responses = []
    for match in re.finditer(r'Response:\n', prompt):
        value, _ = decoder.raw_decode(prompt[match.end():])
        responses.append(value)
    return responses


def block(block_type, **data):
    return {'type': block_type, 'data': data}


NAVBAR = block('navbar', brandName='Acme', ctaText='Go', links=[
    {'label': 'Docs', 'url': '#docs'}, {'label': 'Blog', 'url': ''}, {'label': 'About', 'url': '#about'},
])
FEATURES = block('features', title='Why', features=[
    {'title': 'Fast', 'description': 'Very fast'},
    {'title': 'Safe', 'description': 'Very safe'},
    {'title': 'Cheap', 'description': 'Very cheap'},
])


class TestSchemasAndPrompts:
    def test_every_list_block_of_the_editor_is_a_list_in_the_ai_schema(self):
        for block_type, key in LIST_KEYS.items():
            spec = BLOCK_SCHEMAS[block_type]['fields'][key]
            assert spec['type'] == 'list'
            assert spec['items']

    def test_no_schema_field_is_a_numbered_key(self):
        def names(fields):
            for name, spec in fields.items():
                yield name
                if spec['type'] == 'list':
                    yield from names(spec['items'])

        for schema in BLOCK_SCHEMAS.values():
            for name in names(schema['fields']):
                assert not re.search(r'\d', name), name

    def test_ai_item_fields_exist_in_the_editor_rules(self):
        for block_type, key in LIST_KEYS.items():
            ai_fields = set(BLOCK_SCHEMAS[block_type]['fields'][key]['items'])
            item = {name: '' for name in ai_fields}
            if 'highlighted' in item:
                item['highlighted'] = False
            # clean_block_data drops unknown item keys: nothing may be dropped
            cleaned = clean_block_data(block_type, {key: [item]})[key][0]
            assert ai_fields <= set(cleaned), block_type

    def test_ai_list_limits_fit_inside_the_editor_limits(self):
        for block_type, key in LIST_KEYS.items():
            spec = BLOCK_SCHEMAS[block_type]['fields'][key]
            link_or_url_fields = {'url', 'src', 'image', 'buttonLink'}
            item = {
                name: ('x' if item_spec['type'] == 'string' and name not in link_or_url_fields else False)
                for name, item_spec in spec['items'].items()
            }
            for name in link_or_url_fields & set(item):
                item[name] = ''
            at_max = clean_block_data(block_type, {key: [item] * spec['max_items']})
            assert len(at_max[key]) == spec['max_items']

    @pytest.mark.parametrize('prompt_factory', [get_system_prompt, get_edit_block_system_prompt])
    def test_prompts_never_mention_numbered_keys(self, prompt_factory):
        assert not NUMBERED_KEY.findall(prompt_factory())

    def test_schema_reference_shows_arrays(self):
        reference = build_schema_reference()
        assert '"features": [' in reference
        assert 'array of objects' in reference
        assert not NUMBERED_KEY.findall(reference)

    def test_few_shot_examples_are_valid_for_the_schemas_and_the_editor(self):
        examples = few_shot_responses(get_system_prompt())
        assert len(examples) == 2
        for blocks in examples:
            assert validate_blocks(blocks) == []
            assert [b['type'] for b in finalize_blocks(blocks)] == [b['type'] for b in blocks]

    def test_few_shot_examples_use_every_list_block(self):
        used = {b['type'] for blocks in few_shot_responses(get_system_prompt()) for b in blocks}
        assert {'navbar', 'footer', 'features', 'testimonials', 'pricing', 'faq', 'logoCloud', 'stats'} <= used


class TestValidateBlocks:
    def test_valid_arrays_pass(self):
        assert validate_blocks([NAVBAR, FEATURES]) == []

    def test_old_numbered_shape_is_rejected(self):
        errors = validate_blocks([block('features', title='Why', feature1Title='Fast', feature1Desc='Very fast')])
        assert any("'features'" in error for error in errors)

    def test_non_list_is_rejected(self):
        errors = validate_blocks([block('features', title='Why', features='Fast')])
        assert any('must be a list' in error for error in errors)

    @pytest.mark.parametrize('count', [0, 2, 7])
    def test_item_count_outside_the_limits_is_rejected(self, count):
        item = {'title': 'A', 'description': 'a'}
        errors = validate_blocks([block('features', title='Why', features=[item] * count)])
        assert any('3 to 6 items' in error for error in errors)

    def test_item_must_be_an_object(self):
        errors = validate_blocks([block('features', title='Why', features=['a', 'b', 'c'])])
        assert len([e for e in errors if 'must be an object' in e]) == 3

    def test_required_item_field_and_length_are_checked(self):
        items = [{'title': '', 'description': 'a'}, {'title': 'x' * 61, 'description': 'a'}, {'title': 'ok', 'description': 'a'}]
        errors = validate_blocks([block('features', title='Why', features=items)])
        assert any('features[0]' in e and 'missing or empty' in e for e in errors)
        assert any('features[1]' in e and 'max length' in e for e in errors)
        assert len(errors) == 2

    def test_boolean_item_field_is_checked(self):
        plans = [
            {'name': 'A', 'price': '$1', 'features': 'a', 'buttonText': 'Go', 'highlighted': 'yes'},
            {'name': 'B', 'price': '$2', 'features': 'b', 'buttonText': 'Go'},
        ]
        errors = validate_blocks([block('pricing', title='Plans', plans=plans)])
        assert any('must be a boolean' in e for e in errors)


class TestSanitizeAndFinalize:
    def test_sanitize_fills_item_defaults_cuts_long_text_and_drops_unknown_keys(self):
        result = sanitize_blocks([block('features', title='Why', features=[
            {'title': 'x' * 100, 'description': 'a', 'junk': 1}, 'not an object', {'title': 'B'},
        ])])
        features = result[0]['data']['features']
        assert features == [
            {'title': 'x' * 60, 'description': 'a'},
            {'title': 'B', 'description': ''},
        ]

    def test_sanitize_keeps_at_most_max_items(self):
        item = {'title': 'A', 'description': 'a'}
        result = sanitize_blocks([block('features', title='Why', features=[item] * 9)])
        assert len(result[0]['data']['features']) == 6

    def test_sanitize_defaults_a_missing_list_to_empty(self):
        assert sanitize_blocks([block('features', title='Why')])[0]['data']['features'] == []

    def test_finalize_runs_clean_block_data(self):
        result = finalize_blocks([block('features', title='<b>Why</b>', features=[
            {'title': 'Fast', 'description': '<script>alert(1)</script><strong>Very</strong> fast'},
        ] * 3)])
        data = result[0]['data']
        assert data['title'] == 'Why'
        assert '<script' not in data['features'][0]['description']
        assert '<strong>Very</strong>' in data['features'][0]['description']

    def test_finalize_rejects_what_the_api_would_reject(self):
        evil = block('navbar', brandName='Acme', ctaText='Go', links=[
            {'label': 'Docs', 'url': 'javascript:alert(1)'}, {'label': 'B', 'url': ''}, {'label': 'C', 'url': ''},
        ])
        with pytest.raises(BlockValidationError) as exc_info:
            finalize_blocks([evil])
        assert 'links[0].url' in exc_info.value.errors[0]

    def test_finalize_output_is_what_clean_block_data_returns(self):
        for blocks in few_shot_responses(get_system_prompt()):
            for original, final in zip(sanitize_blocks(blocks), finalize_blocks(blocks)):
                assert final['data'] == clean_block_data(original['type'], original['data'])

    def test_finalize_covers_every_block_type_of_the_schemas(self):
        assert set(BLOCK_SCHEMAS) <= set(BLOCK_VALIDATORS)


@pytest.mark.django_db
class TestViewsUseTheEditorValidation:
    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_generated_page_saves_clean_arrays(self, mock_ai, _provider, _plan, auth_client, user):
        page = PageFactory(owner=user)
        dirty = block('features', title='Why', features=[
            {'title': 'Fast', 'description': '<script>alert(1)</script>Fast <em>really</em>', 'junk': 1},
            {'title': 'Safe', 'description': 'ok'},
            {'title': 'Cheap', 'description': 'ok'},
        ])
        mock_ai.return_value = SimpleNamespace(text=json.dumps([NAVBAR, dirty]), tokens_in=1, tokens_out=1)

        resp = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A page'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        navbar, features = page.blocks.order_by('order')
        assert navbar.data['links'][0] == {'label': 'Docs', 'url': '#docs'}
        assert features.data['features'][0] == {'title': 'Fast', 'description': 'alert(1)Fast <em>really</em>'}
        assert features.data == clean_block_data('features', features.data)
        assert resp.data['blocks'][1]['data'] == features.data

    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_unsafe_link_in_generated_output_is_retried_then_rejected(
        self, mock_ai, _provider, _plan, auth_client, user,
    ):
        page = PageFactory(owner=user)
        existing = BlockFactory(page=page, type='hero', order=0, data={'title': 'Keep me'})
        evil = block('navbar', brandName='Acme', ctaText='Go', links=[
            {'label': 'Docs', 'url': 'javascript:alert(1)'}, {'label': 'B', 'url': ''}, {'label': 'C', 'url': ''},
        ])
        mock_ai.return_value = SimpleNamespace(text=json.dumps([evil]), tokens_in=1, tokens_out=1)

        resp = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A page'}, format='json')

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert mock_ai.call_count == 2
        # The retry tells the model what was wrong
        assert 'links[0].url' in mock_ai.call_args_list[1].args[1]
        assert list(page.blocks.values_list('id', flat=True)) == [existing.id]

    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_generation_retries_when_the_first_answer_breaks_the_editor_rules(
        self, mock_ai, _provider, _plan, auth_client, user,
    ):
        page = PageFactory(owner=user)
        evil = block('navbar', brandName='Acme', ctaText='Go', links=[
            {'label': 'Docs', 'url': 'javascript:alert(1)'}, {'label': 'B', 'url': ''}, {'label': 'C', 'url': ''},
        ])
        mock_ai.side_effect = [
            SimpleNamespace(text=json.dumps([evil]), tokens_in=1, tokens_out=1),
            SimpleNamespace(text=json.dumps([NAVBAR]), tokens_in=1, tokens_out=1),
        ]

        resp = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A page'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert page.blocks.get().data['links'][0]['url'] == '#docs'

    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_old_numbered_output_is_not_saved(self, mock_ai, _provider, _plan, auth_client, user):
        page = PageFactory(owner=user)
        old = block('features', title='Why', feature1Title='A', feature1Desc='a', feature2Title='B', feature2Desc='b')
        mock_ai.return_value = SimpleNamespace(text=json.dumps([old]), tokens_in=1, tokens_out=1)

        resp = auth_client.post(f'/api/pages/{page.id}/generate/', {'prompt': 'A page'}, format='json')

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert page.blocks.count() == 0

    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_edit_block_saves_clean_arrays(self, mock_ai, _provider, _plan, auth_client, user):
        page = PageFactory(owner=user)
        old = {'title': 'Why', 'features': [{'title': 'Old', 'description': 'old'}]}
        target = BlockFactory(page=page, type='features', order=0, data=old)
        edited = block('features', title='Why', features=[
            {'title': 'New', 'description': '<script>alert(1)</script>fresh'},
            {'title': 'Two', 'description': 'two'},
            {'title': 'Three', 'description': 'three'},
        ])
        mock_ai.return_value = SimpleNamespace(text=json.dumps(edited), tokens_in=1, tokens_out=1)

        resp = auth_client.post(
            f'/api/pages/{page.id}/blocks/{target.id}/edit-ai/', {'instruction': 'Rewrite'}, format='json',
        )

        assert resp.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert [f['title'] for f in target.data['features']] == ['New', 'Two', 'Three']
        assert target.data['features'][0]['description'] == 'alert(1)fresh'
        assert resp.data['block']['data'] == target.data

    @patch(GET_PLAN, return_value=plan())
    @patch(RESOLVE_PROVIDER, return_value=('anthropic', 'fake-key', True))
    @patch(CALL_AI)
    def test_edit_block_rejects_unsafe_output_and_keeps_the_block(self, mock_ai, _provider, _plan, auth_client, user):
        page = PageFactory(owner=user)
        original = {'brandName': 'Acme', 'ctaText': 'Go', 'links': [{'label': 'Docs', 'url': '#docs'}]}
        target = BlockFactory(page=page, type='navbar', order=0, data=original)
        evil = block('navbar', brandName='Acme', ctaText='Go', links=[
            {'label': 'Docs', 'url': 'javascript:alert(1)'}, {'label': 'B', 'url': ''}, {'label': 'C', 'url': ''},
        ])
        mock_ai.return_value = SimpleNamespace(text=json.dumps(evil), tokens_in=1, tokens_out=1)

        resp = auth_client.post(
            f'/api/pages/{page.id}/blocks/{target.id}/edit-ai/', {'instruction': 'More links'}, format='json',
        )

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        target.refresh_from_db()
        assert target.data == original

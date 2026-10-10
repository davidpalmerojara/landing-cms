"""Demo mode, own key, live caps and the block edit merge (ADR-023). No test calls a real provider."""
import json
import re
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework import status

from ai_generation import demo
from ai_generation.management.commands import generate_ai_fixtures as fixtures_command
from ai_generation.merge import merge_block_data
from ai_generation.models import AIGenerationLog
from ai_generation.block_schemas import BLOCK_SCHEMAS
from ai_generation.prompts import get_edit_block_system_prompt, get_system_prompt
from ai_generation.providers import ProviderQuotaError
from ai_generation.validators import finalize_blocks, validate_blocks
from pages.models import PageVersion
from tests.factories import BlockFactory, PageFactory, UserFactory

GET_PLAN = 'billing.permissions.get_user_plan'
CALL_AI = 'ai_generation.providers.call_ai'
Source = AIGenerationLog.Source

HERO_JSON = json.dumps([
    {'type': 'navbar', 'data': {'brandName': 'Acme', 'ctaText': 'Go', 'links': [
        {'label': 'A', 'url': ''}, {'label': 'B', 'url': ''}, {'label': 'C', 'url': ''}]}},
    {'type': 'hero', 'data': {'title': 'Hola', 'subtitle': 'Mundo', 'buttonText': 'Empezar'}},
])


def plan(per_hour=10):
    return SimpleNamespace(
        name='pro', display_name='Pro', max_pages=100, max_version_history=50,
        max_ai_generations_per_hour=per_hour, has_custom_domain=True, has_analytics=True, remove_watermark=True,
    )


@pytest.fixture(autouse=True)
def demo_defaults(settings):
    settings.AI_DEMO_MODE = True
    settings.AI_LIVE_DAILY_LIMIT = 30
    settings.AI_LIVE_USER_DAILY_LIMIT = 2


def generate(client, page, prompt='restaurante', **extra):
    return client.post(f'/api/pages/{page.id}/generate/', {'prompt': prompt, **extra}, format='json')


def log_live(user, count, page=None):
    for _ in range(count):
        AIGenerationLog.objects.create(user=user, page=page, prompt='x', source=Source.LIVE)


# --- The saved pages themselves ---

class TestFixtures:
    def test_there_are_ten_pages_in_both_languages(self):
        fixtures = demo.load_fixtures()
        assert len(fixtures) >= 10
        assert {f.language for f in fixtures} == {'es', 'en'}
        assert len({f.id for f in fixtures}) == len(fixtures)

    @pytest.mark.parametrize('fixture', demo.load_fixtures(), ids=lambda f: f.id)
    def test_every_page_passes_the_pipeline_validation_and_the_review(self, fixture):
        blocks = [dict(b) for b in fixture.blocks]
        assert validate_blocks(blocks) == []
        # Serving it runs finalize_blocks again: it must not change anything
        assert finalize_blocks(blocks) == blocks
        assert fixtures_command.review_blocks(blocks) == []
        assert set(fixture.title) == {'es', 'en'}
        assert fixture.keywords

    def test_every_block_type_but_custom_html_has_a_saved_variant(self):
        for block_type in BLOCK_SCHEMAS:
            assert len(demo.block_variants(block_type)) >= 2, block_type

    def test_collab2_004_no_fixture_holds_html_entities(self):
        # Fields are plain text (ADR-029): "&amp;" would be shown literally
        for path in demo.FIXTURES_DIR.glob('*.json'):
            text = path.read_text(encoding='utf-8')
            for entity in ('&amp;', '&lt;', '&gt;', '&quot;', '&#'):
                assert entity not in text, (path.name, entity)

    def test_fixture_prompts_are_the_ones_the_command_generates(self):
        specs = {s['id']: s for s in fixtures_command.FIXTURE_SPECS}
        for fixture in demo.load_fixtures():
            assert fixture.prompt == specs[fixture.id]['prompt']
            assert fixture.language == specs[fixture.id]['language']

    def test_fixtures_name_no_real_provider_or_model(self):
        text = ' '.join(p.read_text(encoding='utf-8') for p in demo.FIXTURES_DIR.glob('*.json')).lower()
        for word in ('gemini', 'claude', 'anthropic', 'openai', 'chatgpt'):
            assert word not in text


# --- Matching free text to a fixture ---

class TestMatching:
    @pytest.mark.parametrize('prompt,language,expected', [
        ('Quiero una web para mi restaurante italiano con reservas', 'es', 'restaurant'),
        ('A page for my restaurant with a menu and bookings', 'en', 'restaurant'),
        ('Landing de una cafetería en Madrid', 'es', 'restaurant'),
        ('Mi gimnasio necesita una página con clases y tarifas', 'es', 'fitness-studio'),
        ('Landing page for a yoga studio', 'en', 'fitness-studio'),
        ('Dashboard de analítica para mi SaaS', 'es', 'saas-analytics'),
        ('Analytics platform for startups', 'en', 'saas-analytics'),
        ('Portfolio de fotógrafa freelance', 'es', 'design-portfolio'),
        ('Conferencia de tecnología con ponentes y entradas', 'es', 'conference'),
        ('A summit with speakers and tickets', 'en', 'conference'),
        ('Un curso online para aprender a programar', 'es', 'online-course'),
        ('Download page for our new iOS and Android app', 'en', 'app-launch'),
        ('ONG de voluntarios y donaciones', 'es', 'nonprofit'),
        ('Tienda de joyería hecha a mano', 'es', 'small-shop'),
        ('Despacho de abogados y asesoría', 'es', 'consultancy'),
    ])
    def test_free_text_goes_to_the_fixture_of_its_topic(self, prompt, language, expected):
        match = demo.match_fixture(prompt, language)
        assert match.matched
        assert match.fixture.id == expected

    def test_accents_and_case_do_not_matter(self):
        assert demo.match_fixture('CAFETERÍA', 'es').fixture.id == demo.match_fixture('cafeteria', 'es').fixture.id

    def test_the_exact_text_of_a_suggestion_returns_that_fixture(self):
        for fixture in demo.load_fixtures():
            match = demo.match_fixture(fixture.prompt, 'es' if fixture.language == 'en' else 'en')
            assert match.fixture.id == fixture.id
            assert match.matched

    def test_without_a_match_the_fallback_is_deterministic_and_in_the_language(self):
        first = demo.match_fixture('zzz qqq xyzzy', 'en')
        assert not first.matched
        assert first.fixture.language == 'en'
        assert demo.match_fixture('zzz qqq xyzzy', 'en').fixture.id == first.fixture.id
        assert demo.match_fixture('zzz qqq xyzzy', 'es').fixture.language == 'es'

    def test_different_unmatched_texts_do_not_all_land_on_one_page(self):
        picked = {demo.match_fixture(f'qwerty {n} asdf', 'es').fixture.id for n in range(30)}
        assert len(picked) > 1

    def test_prompts_are_listed_in_the_requested_language_first(self):
        es = demo.list_prompts('es')
        assert len(es) == len(demo.load_fixtures())
        assert es[0]['language'] == 'es'
        assert demo.list_prompts('en')[0]['language'] == 'en'
        assert es[0]['title'] != demo.list_prompts('en')[0]['title'] or es[0]['id'] != demo.list_prompts('en')[0]['id']


# --- Page generation in demo mode ---

@pytest.mark.django_db
class TestDemoGeneration:
    @patch(CALL_AI)
    def test_serves_a_validated_fixture_with_snapshot_and_log(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='cta', order=0, data={'title': 'Old', 'buttonText': 'Go'})

        resp = generate(auth_client, page, 'Quiero una web para mi restaurante')

        assert resp.status_code == status.HTTP_200_OK
        mock_ai.assert_not_called()
        assert resp.data['source'] == 'demo'
        assert resp.data['provider'] is None
        assert resp.data['demo'] == {'reason': 'demo_mode', 'origin': 'placeholder', 'fixture_id': 'restaurant', 'matched': True}
        assert resp.data['tokens'] == {'input': 0, 'output': 0, 'cost_estimate': '0'}

        fixture = next(f for f in demo.load_fixtures() if f.id == 'restaurant')
        saved = list(page.blocks.order_by('order'))
        assert [b.type for b in saved] == [b['type'] for b in fixture.blocks]
        assert [{'type': b.type, 'data': b.data} for b in saved] == finalize_blocks(list(fixture.blocks))
        assert resp.data['block_count'] == len(saved)

        version = PageVersion.objects.get(page=page, trigger='auto_ai_generation')
        assert [b['type'] for b in version.snapshot] == ['cta']  # the page before the change

        log = AIGenerationLog.objects.get()
        assert (log.source, log.mode, log.tokens_in, log.tokens_out, log.cost_estimate) == (
            Source.DEMO, AIGenerationLog.Mode.FULL_PAGE, 0, 0, 0)

    @patch(CALL_AI)
    def test_works_on_a_plan_without_ai_and_ignores_the_server_key(self, mock_ai, auth_client, user, settings):
        settings.GOOGLE_AI_KEY = 'server-key'
        page = PageFactory(owner=user)
        with patch(GET_PLAN, return_value=plan(per_hour=0)):
            resp = generate(auth_client, page)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['source'] == 'demo'
        mock_ai.assert_not_called()

    def test_unmatched_prompt_still_gets_a_page(self, auth_client, user):
        page = PageFactory(owner=user)
        resp = generate(auth_client, page, 'zzz qqq', language='en')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['demo']['matched'] is False
        assert next(f for f in demo.load_fixtures() if f.id == resp.data['demo']['fixture_id']).language == 'en'

    def test_waits_like_a_real_call(self, auth_client, user, settings):
        settings.AI_DEMO_DELAY_SECONDS = 2.5
        page = PageFactory(owner=user)
        with patch('ai_generation.views.time.sleep') as sleep:
            generate(auth_client, page)
        sleep.assert_called_once_with(2.5)

    def test_does_not_wait_when_the_delay_is_zero(self, auth_client, user):
        page = PageFactory(owner=user)
        with patch('ai_generation.views.time.sleep') as sleep:
            generate(auth_client, page)
        sleep.assert_not_called()

    def test_a_fixture_that_fails_validation_is_not_saved(self, auth_client, user):
        page = PageFactory(owner=user)
        BlockFactory(page=page, type='cta', order=0, data={'title': 'Keep', 'buttonText': 'Go'})
        bad = demo.DemoFixture('bad', 'es', 'p', {'es': 'x', 'en': 'x'}, ('restaur',),
                               ({'type': 'navbar', 'data': {'brandName': 'x', 'ctaText': 'y', 'links': [
                                   {'label': 'a', 'url': 'javascript:alert(1)'}, {'label': 'b', 'url': ''}, {'label': 'c', 'url': ''}]}},))
        with patch.object(demo, 'load_fixtures', return_value=(bad,)):
            resp = generate(auth_client, page)
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert resp.data['code'] == 'DEMO_FIXTURE_INVALID'
        assert [b.data['title'] for b in page.blocks.all()] == ['Keep']

    def test_other_users_pages_stay_off_limits(self, api_client):
        page = PageFactory(owner=UserFactory())
        api_client.force_authenticate(user=UserFactory())
        assert generate(api_client, page).status_code == status.HTTP_404_NOT_FOUND


# --- Suggestions endpoint ---

@pytest.mark.django_db
class TestOptionsEndpoint:
    def test_requires_login(self, api_client):
        assert api_client.get('/api/ai/options/').status_code == status.HTTP_401_UNAUTHORIZED

    def test_lists_the_prompts_in_the_requested_language(self, auth_client):
        resp = auth_client.get('/api/ai/options/?language=en')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['mode'] == 'demo'
        assert len(resp.data['prompts']) >= 10
        first = resp.data['prompts'][0]
        assert set(first) == {'id', 'title', 'prompt', 'language'}
        assert first['language'] == 'en'
        titles_es = {p['id']: p['title'] for p in auth_client.get('/api/ai/options/?language=es').data['prompts']}
        titles_en = {p['id']: p['title'] for p in resp.data['prompts']}
        assert titles_es['restaurant'] == 'Restaurante mediterráneo'
        assert titles_en['restaurant'] == 'Mediterranean restaurant'

    def test_rejects_an_unknown_language(self, auth_client):
        assert auth_client.get('/api/ai/options/?language=fr').status_code == status.HTTP_400_BAD_REQUEST

    def test_mode_reflects_the_settings(self, auth_client, settings):
        settings.AI_DEMO_MODE = False
        assert auth_client.get('/api/ai/options/').data['mode'] == 'unavailable'
        settings.GOOGLE_AI_KEY = 'server-key'
        resp = auth_client.get('/api/ai/options/')
        assert resp.data['mode'] == 'live'
        assert resp.data['live_user_daily_limit'] == 2


# --- Own key ---

@pytest.mark.django_db
class TestOwnKey:
    @patch(CALL_AI)
    def test_own_key_bypasses_demo_mode_and_the_plan(self, mock_ai, auth_client, user, settings):
        settings.GOOGLE_AI_KEY = 'server-key'
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=10, tokens_out=20)
        page = PageFactory(owner=user)

        with patch(GET_PLAN, return_value=plan(per_hour=0)):
            resp = generate(auth_client, page, provider='gemini', api_key='user-own-key')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['source'] == 'own_key'
        assert 'demo' not in resp.data
        assert mock_ai.call_args.args[2:] == ('gemini', 'user-own-key')
        assert [b.type for b in page.blocks.order_by('order')] == ['navbar', 'hero']
        assert AIGenerationLog.objects.get().source == Source.OWN_KEY

    @patch(CALL_AI)
    def test_own_key_calls_do_not_use_up_the_plan_or_the_live_caps(self, mock_ai, auth_client, user, settings):
        settings.AI_DEMO_MODE = False
        settings.GOOGLE_AI_KEY = 'server-key'
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)
        page = PageFactory(owner=user)
        for _ in range(5):
            AIGenerationLog.objects.create(user=user, page=page, prompt='x', source=Source.OWN_KEY)

        with patch(GET_PLAN, return_value=plan(per_hour=1)):
            own = generate(auth_client, page, provider='gemini', api_key='mine')
            live = generate(auth_client, page)

        assert own.data['source'] == 'own_key'
        assert live.data['source'] == 'live'

    @patch(CALL_AI, side_effect=ProviderQuotaError('quota'))
    def test_own_key_without_quota_is_reported_not_replaced_by_a_saved_page(self, _ai, auth_client, user):
        page = PageFactory(owner=user)
        resp = generate(auth_client, page, provider='gemini', api_key='mine')
        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert resp.data['code'] == 'AI_KEY_QUOTA'
        assert not page.blocks.exists()

    @patch(CALL_AI)
    def test_the_key_is_neither_stored_nor_logged(self, mock_ai, auth_client, user, caplog):
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)
        page = PageFactory(owner=user)
        with caplog.at_level('DEBUG'):
            generate(auth_client, page, provider='anthropic', api_key='sk-ant-very-secret-key')
        assert 'very-secret' not in caplog.text
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM ai_generation_aigenerationlog')
            assert 'very-secret' not in repr(cursor.fetchall())


# --- Live server key with daily caps ---

@pytest.mark.django_db
class TestLiveCaps:
    @pytest.fixture(autouse=True)
    def live(self, settings):
        settings.AI_DEMO_MODE = False
        settings.GOOGLE_AI_KEY = 'server-key'
        with patch(GET_PLAN, return_value=plan(per_hour=50)):
            yield

    @patch(CALL_AI)
    def test_under_the_caps_the_server_key_is_used(self, mock_ai, auth_client, user):
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=5, tokens_out=6)
        page = PageFactory(owner=user)
        log_live(user, 1)

        resp = generate(auth_client, page)

        assert resp.data['source'] == 'live'
        assert resp.data['provider'] == 'gemini'
        assert mock_ai.call_args.args[2:] == ('gemini', 'server-key')
        assert AIGenerationLog.objects.filter(source=Source.LIVE).count() == 2

    @patch(CALL_AI)
    def test_the_per_user_cap_serves_a_saved_page(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        log_live(user, 2)

        resp = generate(auth_client, page)

        assert resp.status_code == status.HTTP_200_OK
        mock_ai.assert_not_called()
        assert resp.data['source'] == 'demo'
        assert resp.data['demo']['reason'] == 'daily_limit'
        assert AIGenerationLog.objects.order_by('-created_at').first().source == Source.DEMO

    @patch(CALL_AI)
    def test_the_global_cap_serves_a_saved_page(self, mock_ai, auth_client, user, settings):
        settings.AI_LIVE_DAILY_LIMIT = 5
        others = UserFactory()
        log_live(others, 5)
        page = PageFactory(owner=user)

        resp = generate(auth_client, page)

        mock_ai.assert_not_called()
        assert resp.data['source'] == 'demo'
        assert resp.data['demo']['reason'] == 'daily_limit'

    @patch(CALL_AI)
    def test_only_todays_live_calls_count(self, mock_ai, auth_client, user):
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)
        page = PageFactory(owner=user)
        log_live(user, 2)
        AIGenerationLog.objects.update(created_at=timezone.now() - timedelta(days=1, minutes=1))
        for source in (Source.DEMO, Source.OWN_KEY, Source.DEMO):
            AIGenerationLog.objects.create(user=user, page=page, prompt='x', source=source)

        assert generate(auth_client, page).data['source'] == 'live'

    @patch(CALL_AI)
    def test_the_caps_come_from_the_settings(self, mock_ai, auth_client, user, settings):
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)
        settings.AI_LIVE_USER_DAILY_LIMIT = 1
        page = PageFactory(owner=user)
        assert generate(auth_client, page).data['source'] == 'live'
        assert generate(auth_client, page).data['source'] == 'demo'

    @patch(CALL_AI, side_effect=ProviderQuotaError('429 RESOURCE_EXHAUSTED'))
    def test_provider_quota_falls_back_to_a_saved_page(self, _ai, auth_client, user):
        page = PageFactory(owner=user)

        resp = generate(auth_client, page, 'una cafetería')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['source'] == 'demo'
        assert resp.data['demo']['reason'] == 'provider_quota'
        assert page.blocks.exists()
        log = AIGenerationLog.objects.get()
        assert (log.source, log.cost_estimate) == (Source.DEMO, 0)

    @patch(CALL_AI, side_effect=ProviderQuotaError('quota'))
    def test_edit_falls_back_to_a_saved_variant_with_the_reason(self, _ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='cta', order=0, data={'title': 'Old', 'buttonText': 'Go'})

        resp = auth_client.post(f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/',
                                {'instruction': 'Make it shorter'}, format='json')

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['source'] == 'demo'
        assert resp.data['demo']['reason'] == 'provider_quota'

    @patch(CALL_AI)
    def test_the_plan_limit_still_applies_to_the_server_key(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        with patch(GET_PLAN, return_value=plan(per_hour=0)):
            resp = generate(auth_client, page)
        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert resp.data['code'] == 'AI_PLAN_LIMIT'
        mock_ai.assert_not_called()

    def test_saved_responses_do_not_count_toward_the_hourly_plan_limit(self, auth_client, user):
        page = PageFactory(owner=user)
        for _ in range(3):
            AIGenerationLog.objects.create(user=user, page=page, prompt='x', source=Source.DEMO)
        with patch(GET_PLAN, return_value=plan(per_hour=1)), patch(CALL_AI) as mock_ai:
            mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)
            assert generate(auth_client, page).data['source'] == 'live'

    def test_without_a_server_key_the_error_says_so(self, auth_client, user, settings):
        settings.GOOGLE_AI_KEY = ''
        page = PageFactory(owner=user)
        resp = generate(auth_client, page)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'AI_NOT_CONFIGURED'


# --- Providers ---

class TestProviders:
    def test_model_names_come_from_the_settings(self, settings):
        from ai_generation.providers import call_ai
        settings.GEMINI_MODEL = 'model-from-settings'
        with patch('google.genai.Client') as client:
            client.return_value.models.generate_content.return_value = SimpleNamespace(text='[]', usage_metadata=None)
            call_ai('system', 'user', 'gemini', 'key')
        assert client.return_value.models.generate_content.call_args.kwargs['model'] == 'model-from-settings'

    @pytest.mark.parametrize('code,status_name', [(429, 'RESOURCE_EXHAUSTED'), (402, 'RESOURCE_EXHAUSTED')])
    def test_gemini_quota_errors_become_provider_quota_error(self, code, status_name):
        from google.genai import errors
        from ai_generation.providers import call_ai
        error = errors.ClientError(code, {'error': {'code': code, 'status': status_name, 'message': 'quota'}})
        with patch('google.genai.Client') as client:
            client.return_value.models.generate_content.side_effect = error
            with pytest.raises(ProviderQuotaError):
                call_ai('system', 'user', 'gemini', 'key')

    def test_other_gemini_errors_are_not_quota_errors(self):
        from google.genai import errors
        from ai_generation.providers import call_ai
        error = errors.ClientError(400, {'error': {'code': 400, 'status': 'INVALID_ARGUMENT', 'message': 'bad'}})
        with patch('google.genai.Client') as client:
            client.return_value.models.generate_content.side_effect = error
            with pytest.raises(errors.ClientError):
                call_ai('system', 'user', 'gemini', 'key')

    def test_env_example_documents_the_ai_settings(self):
        text = (Path(__file__).resolve().parents[2] / '.env.example').read_text(encoding='utf-8')
        for name in ('AI_DEMO_MODE', 'AI_DEMO_DELAY_SECONDS', 'AI_LIVE_DAILY_LIMIT', 'AI_LIVE_USER_DAILY_LIMIT',
                     'GEMINI_MODEL', 'ANTHROPIC_MODEL'):
            assert re.search(rf'^{name}=', text, re.MULTILINE), name

    def test_model_ids_live_only_in_settings(self):
        root = Path(__file__).resolve().parents[2]
        offenders = [
            str(path.relative_to(root))
            for path in root.rglob('*.py')
            if 'venv' not in path.parts and 'tests' not in path.parts and path.name != 'settings.py'
            and re.search(r'gemini-\d|claude-(?:sonnet|opus|haiku)', path.read_text(encoding='utf-8'))
        ]
        assert offenders == []


class TestPrompts:
    @pytest.mark.parametrize('prompt', [get_system_prompt, get_edit_block_system_prompt])
    def test_prompts_name_paxl_and_no_other_product(self, prompt):
        text = prompt()
        assert 'Paxl' in text
        for brand in ('Elementor', 'Webflow', 'Wix', 'Squarespace', 'Framer', 'WordPress', 'Gemini', 'Claude',
                      'Stripe', 'Vercel', 'TechCrunch', 'Y Combinator', 'GitHub', 'Slack', 'Figma', 'Jira'):
            assert brand not in text, brand


# --- Editing a block ---

def edit(client, page, block, instruction='Make it better', **extra):
    return client.post(f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/', {'instruction': instruction, **extra}, format='json')


def edit_in(client, page, block, instruction, interface_language):
    """An edit asked from an interface in `interface_language` (Accept-Language)."""
    return client.post(f'/api/pages/{page.id}/blocks/{block.id}/edit-ai/', {'instruction': instruction},
                       format='json', HTTP_ACCEPT_LANGUAGE=interface_language)


FULL_HERO = {
    'title': 'Old title', 'subtitle': 'Old subtitle', 'buttonText': 'Go', 'buttonLink': '#pricing',
    'badgeText': 'New', 'secondaryButtonText': 'More', 'secondaryButtonLink': '#more',
    'backgroundImage': 'https://example.com/hero.jpg', 'alignment': 'left',
}


class TestMergeBlockData:
    def test_keys_the_model_did_not_return_are_kept(self):
        merged = merge_block_data(FULL_HERO, {'title': 'N'}, {'title': 'N', 'subtitle': '', 'alignment': 'center'})
        assert merged == {**FULL_HERO, 'title': 'N'}

    def test_returned_keys_win(self):
        returned = {'title': 'N', 'alignment': 'center'}
        assert merge_block_data(FULL_HERO, returned, dict(returned))['alignment'] == 'center'

    def test_an_empty_image_does_not_wipe_the_existing_one(self):
        merged = merge_block_data(FULL_HERO, {'backgroundImage': '', 'title': 'N'}, {'backgroundImage': '', 'title': 'N'})
        assert merged['backgroundImage'] == 'https://example.com/hero.jpg'

    def test_list_items_keep_their_fields_outside_the_schema(self):
        current = {'plans': [
            {'name': 'A', 'price': '1', 'buttonLink': '#a', 'highlighted': False},
            {'name': 'B', 'price': '2', 'buttonLink': '#b', 'highlighted': True},
        ]}
        returned = {'plans': [{'name': 'A2', 'price': '1'}, {'name': 'B2', 'price': '3'}]}
        cleaned = {'plans': [
            {'name': 'A2', 'price': '1', 'highlighted': False}, {'name': 'B2', 'price': '3', 'highlighted': False}]}
        merged = merge_block_data(current, returned, cleaned)
        assert merged['plans'][0] == {'name': 'A2', 'price': '1', 'buttonLink': '#a', 'highlighted': False}
        # highlighted was not in the returned item: the stored value stays
        assert merged['plans'][1] == {'name': 'B2', 'price': '3', 'buttonLink': '#b', 'highlighted': True}

    def test_lists_follow_the_model_for_extra_and_missing_items(self):
        current = {'links': [{'label': str(n), 'url': f'#{n}', 'icon': 'x'} for n in range(3)]}
        shorter = {'links': [{'label': 'a', 'url': '#a'}]}
        assert merge_block_data(current, shorter, shorter)['links'] == [{'label': 'a', 'url': '#a', 'icon': 'x'}]
        longer = {'links': [{'label': str(n), 'url': f'#{n}'} for n in range(5)]}
        merged = merge_block_data(current, longer, longer)['links']
        assert len(merged) == 5
        assert merged[0]['icon'] == 'x'
        assert 'icon' not in merged[4]


@pytest.mark.django_db
class TestEditKeepsTheFieldsOutsideTheSchema:
    @pytest.fixture(autouse=True)
    def live(self, settings):
        settings.AI_DEMO_MODE = False
        settings.GOOGLE_AI_KEY = 'server-key'
        with patch(GET_PLAN, return_value=plan()):
            yield

    @patch(CALL_AI)
    def test_hero_keeps_links_badge_and_image(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'hero', 'data': {
            'title': 'Brand new title', 'subtitle': 'Old subtitle', 'buttonText': 'Go', 'backgroundImage': '',
            'alignment': 'left'}}), tokens_in=1, tokens_out=1)

        resp = edit(auth_client, page, block)

        assert resp.status_code == status.HTTP_200_OK
        block.refresh_from_db()
        assert block.data == {**FULL_HERO, 'title': 'Brand new title'}
        assert resp.data['block']['data'] == block.data
        assert resp.data['source'] == 'live'

    @patch(CALL_AI)
    def test_pricing_keeps_each_plans_link(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        data = {'title': 'Plans', 'subtitle': '', 'billingPeriod': '/month', 'popularBadgeText': 'Best', 'plans': [
            {'name': 'Free', 'price': '0', 'features': 'a', 'buttonText': 'Go', 'buttonLink': '#free', 'highlighted': False},
            {'name': 'Pro', 'price': '9', 'features': 'b', 'buttonText': 'Go', 'buttonLink': '#pro', 'highlighted': True}]}
        block = BlockFactory(page=page, type='pricing', order=0, data=data)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'pricing', 'data': {
            'title': 'Plans', 'subtitle': '', 'plans': [
                {'name': 'Free', 'price': '0', 'features': 'a', 'buttonText': 'Go', 'highlighted': False},
                {'name': 'Pro', 'price': '12', 'features': 'b', 'buttonText': 'Go', 'highlighted': True}]}}),
            tokens_in=1, tokens_out=1)

        edit(auth_client, page, block)

        block.refresh_from_db()
        assert [p['buttonLink'] for p in block.data['plans']] == ['#free', '#pro']
        assert block.data['plans'][1]['price'] == '12'
        assert block.data['billingPeriod'] == '/month'
        assert block.data['popularBadgeText'] == 'Best'

    @patch(CALL_AI)
    def test_contact_keeps_its_placeholders(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        data = {'title': 'Write', 'subtitle': 's', 'buttonText': 'Send', 'namePlaceholder': 'Your name',
                'emailPlaceholder': 'you@mail.com', 'messagePlaceholder': 'Say hi'}
        block = BlockFactory(page=page, type='contact', order=0, data=data)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'contact', 'data': {
            'title': 'Get in touch', 'subtitle': 's', 'buttonText': 'Send'}}), tokens_in=1, tokens_out=1)

        edit(auth_client, page, block)

        block.refresh_from_db()
        assert block.data == {**data, 'title': 'Get in touch'}

    @patch(CALL_AI)
    def test_changing_the_type_replaces_the_data(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'cta', 'data': {
            'title': 'Now a CTA', 'buttonText': 'Go'}}), tokens_in=1, tokens_out=1)

        edit(auth_client, page, block)

        block.refresh_from_db()
        assert block.type == 'cta'
        assert 'badgeText' not in block.data

    @patch(CALL_AI)
    def test_the_merged_block_is_snapshotted_logged_and_never_stores_the_key(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'hero', 'data': {
            'title': 'T', 'subtitle': 'S', 'buttonText': 'Go'}}), tokens_in=3, tokens_out=4)

        edit(auth_client, page, block, provider='anthropic', api_key='sk-own')

        assert PageVersion.objects.filter(page=page, trigger='auto_ai_generation').count() == 1
        log = AIGenerationLog.objects.get()
        assert (log.source, log.mode, log.tokens_in) == (Source.OWN_KEY, AIGenerationLog.Mode.EDIT_BLOCK, 3)


@pytest.mark.django_db
class TestDemoEdit:
    @patch(CALL_AI)
    def test_returns_a_variant_of_the_same_type_and_says_so(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)

        resp = edit(auth_client, page, block, 'Make it funnier')

        assert resp.status_code == status.HTTP_200_OK
        mock_ai.assert_not_called()
        assert resp.data['source'] == 'demo'
        assert resp.data['demo'] == {'reason': 'demo_mode', 'origin': 'placeholder'}
        block.refresh_from_db()
        assert block.type == 'hero'
        assert block.data['title'] != FULL_HERO['title']
        assert block.data['title'] in [v['title'] for v in demo.block_variants('hero')]
        # What the saved variant does not have stays as it was
        assert block.data['buttonLink'] == '#pricing'
        assert block.data['badgeText'] == 'New'
        assert block.data['backgroundImage'] == 'https://example.com/hero.jpg'

    def test_the_same_instruction_gives_the_same_variant(self, auth_client, user):
        page = PageFactory(owner=user)
        first = BlockFactory(page=page, type='cta', order=0, data={'title': 'A', 'buttonText': 'Go'})
        second = BlockFactory(page=page, type='cta', order=1, data={'title': 'A', 'buttonText': 'Go'})
        a = edit(auth_client, page, first, 'x')
        b = edit(auth_client, page, first, 'x')
        # The block changed in between, so it never returns the variant it already shows
        assert a.data['block']['data'] != b.data['block']['data']
        assert second.data == {'title': 'A', 'buttonText': 'Go'}

    def test_snapshot_and_log_like_a_real_edit(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='faq', order=0, data={'title': 'Old', 'questions': [{'question': 'q', 'answer': 'a'}]})

        edit(auth_client, page, block)

        assert PageVersion.objects.filter(page=page, trigger='auto_ai_generation').count() == 1
        log = AIGenerationLog.objects.get()
        assert (log.source, log.mode, log.cost_estimate) == (Source.DEMO, AIGenerationLog.Mode.EDIT_BLOCK, 0)

    def test_the_variant_is_validated_like_any_edit(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)
        bad = {'title': 'x', 'subtitle': 's', 'buttonText': 'y', 'backgroundImage': 'javascript:alert(1)'}
        with patch.object(demo, 'pick_variant', return_value=bad):
            resp = edit(auth_client, page, block)
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert resp.data['code'] == 'DEMO_FIXTURE_INVALID'
        block.refresh_from_db()
        assert block.data == FULL_HERO

    @pytest.mark.parametrize('language', ['es', 'en'])
    @pytest.mark.parametrize('block_type, data', [
        ('hero', FULL_HERO),
        ('cta', {'title': 'Old', 'buttonText': 'Go'}),
        ('features', {'title': 'Old', 'features': [{'title': 't', 'description': 'd'}]}),
    ])
    def test_editor2_002_the_variant_is_in_the_page_language(self, auth_client, user, language, block_type, data):
        page = PageFactory(owner=user, language=language)
        in_language = demo.block_variants(block_type, language)

        for instruction in ('Hazlo más corto', 'Make it shorter', 'Más formal', 'Funnier'):
            block = BlockFactory(page=page, type=block_type, order=0, data=data)
            # The interface asks in the other language: the page's language decides
            resp = edit_in(auth_client, page, block, instruction, 'en' if language == 'es' else 'es')

            assert resp.status_code == status.HTTP_200_OK
            assert resp.data['block']['data']['title'] in [v['title'] for v in in_language], instruction
            block.delete()

    def test_editor2_002_a_page_in_another_language_follows_the_interface(self, auth_client, user):
        page = PageFactory(owner=user, language='pt-BR')
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)

        resp = edit_in(auth_client, page, block, 'Make it better', 'en')

        assert resp.data['block']['data']['title'] in [v['title'] for v in demo.block_variants('hero', 'en')]

    def test_editor2_002_no_variant_in_the_language_is_reported_not_answered_in_another(self, auth_client, user):
        page = PageFactory(owner=user, language='es')
        (only,) = demo.block_variants('stats', 'es')
        block = BlockFactory(page=page, type='stats', order=0, data=only)

        resp = edit(auth_client, page, block)

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert resp.data['code'] == 'DEMO_NO_VARIANT'

    def test_a_type_without_saved_variants_is_reported_not_faked(self, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='customHtml', order=0, data={'html': '<p>x</p>'})

        resp = edit(auth_client, page, block)

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert resp.data['code'] == 'DEMO_NO_VARIANT'
        block.refresh_from_db()
        assert block.data == {'html': '<p>x</p>'}
        assert not AIGenerationLog.objects.exists()

    @patch(CALL_AI)
    def test_own_key_edits_for_real_in_demo_mode(self, mock_ai, auth_client, user):
        page = PageFactory(owner=user)
        block = BlockFactory(page=page, type='hero', order=0, data=FULL_HERO)
        mock_ai.return_value = SimpleNamespace(text=json.dumps({'type': 'hero', 'data': {
            'title': 'From the model', 'subtitle': 'S', 'buttonText': 'Go'}}), tokens_in=1, tokens_out=1)

        resp = edit(auth_client, page, block, provider='gemini', api_key='mine')

        assert resp.data['source'] == 'own_key'
        block.refresh_from_db()
        assert block.data['title'] == 'From the model'
        assert block.data['buttonLink'] == '#pricing'


# --- generate_ai_fixtures command ---

@pytest.mark.django_db
class TestGenerateFixturesCommand:
    SECRET = 'AIza-secret-key-for-the-test'

    @pytest.fixture
    def env_file(self, tmp_path):
        path = tmp_path / '.env'
        path.write_text(f'GOOGLE_AI_KEY={self.SECRET}\n', encoding='utf-8')
        return path

    @pytest.fixture
    def out_dir(self, tmp_path):
        directory = tmp_path / 'fixtures'
        with patch.object(fixtures_command, 'FIXTURES_DIR', directory):
            yield directory

    @pytest.fixture
    def good_page(self):
        blocks = [dict(b) for b in next(f for f in demo.load_fixtures() if f.id == 'saas-analytics').blocks]
        return json.dumps(blocks)

    def run(self, env_file, capsys, *args):
        call_command('generate_ai_fixtures', '--env-file', str(env_file), '--pause', '0', *args)
        return capsys.readouterr()

    @patch(CALL_AI)
    def test_writes_reviewed_fixtures_with_the_real_pipeline(self, mock_ai, env_file, out_dir, good_page, capsys):
        mock_ai.return_value = SimpleNamespace(text=good_page, tokens_in=1, tokens_out=2)

        output = self.run(env_file, capsys, '--only', 'restaurant', 'nonprofit')

        assert mock_ai.call_count == 2
        assert mock_ai.call_args.args[2:] == ('gemini', self.SECRET)
        written = json.loads((out_dir / 'restaurant.json').read_text(encoding='utf-8'))
        spec = next(s for s in fixtures_command.FIXTURE_SPECS if s['id'] == 'restaurant')
        assert written['prompt'] == spec['prompt']
        assert written['language'] == 'es'
        assert written['origin'] == 'generated'
        assert written['blocks'] == finalize_blocks(json.loads(good_page))
        assert self.SECRET not in output.out + output.err

    @patch(CALL_AI)
    def test_skips_existing_files(self, mock_ai, env_file, out_dir, good_page, capsys):
        out_dir.mkdir()
        (out_dir / 'restaurant.json').write_text('{}', encoding='utf-8')
        mock_ai.return_value = SimpleNamespace(text=good_page, tokens_in=1, tokens_out=2)

        self.run(env_file, capsys, '--only', 'restaurant')

        mock_ai.assert_not_called()

    @patch(CALL_AI, side_effect=ProviderQuotaError('402 credits depleted'))
    def test_stops_when_the_quota_is_used_up(self, mock_ai, env_file, out_dir, capsys):
        with pytest.raises(CommandError, match='quota'):
            self.run(env_file, capsys)
        assert mock_ai.call_count == 1
        assert not list(out_dir.glob('*.json'))

    @patch(CALL_AI, side_effect=RuntimeError('network down'))
    def test_stops_at_the_first_provider_failure(self, mock_ai, env_file, out_dir, capsys):
        with pytest.raises(CommandError, match='RuntimeError'):
            self.run(env_file, capsys)
        assert mock_ai.call_count == 1

    @patch(CALL_AI)
    def test_never_exceeds_the_call_cap_even_with_retries(self, mock_ai, env_file, out_dir, capsys):
        mock_ai.return_value = SimpleNamespace(text='not json', tokens_in=1, tokens_out=1)

        with pytest.raises(CommandError):
            self.run(env_file, capsys, '--max-calls', '3')

        assert mock_ai.call_count == 3

    @patch(CALL_AI)
    def test_a_page_that_fails_review_is_not_saved(self, mock_ai, env_file, out_dir, capsys):
        mock_ai.return_value = SimpleNamespace(text=HERO_JSON, tokens_in=1, tokens_out=1)  # 2 blocks only

        with pytest.raises(CommandError, match='not saved'):
            self.run(env_file, capsys, '--only', 'restaurant')

        assert not (out_dir / 'restaurant.json').exists()

    def test_without_a_key_it_refuses(self, tmp_path, out_dir, capsys, settings):
        empty = tmp_path / 'empty.env'
        empty.write_text('', encoding='utf-8')
        with pytest.raises(CommandError, match='GOOGLE_AI_KEY'):
            self.run(empty, capsys)


class TestFixtureOrigin:
    def test_hand_written_fixtures_are_reported_as_placeholders(self):
        from ai_generation import demo
        assert {f.origin for f in demo.load_fixtures()} == {demo.ORIGIN_PLACEHOLDER}
        assert demo.fixtures_origin() == demo.ORIGIN_PLACEHOLDER

    def test_generated_only_when_every_fixture_is_generated(self, monkeypatch):
        from dataclasses import replace
        from ai_generation import demo
        fixtures = demo.load_fixtures()
        all_generated = tuple(replace(f, origin=demo.ORIGIN_GENERATED) for f in fixtures)
        monkeypatch.setattr(demo, 'load_fixtures', lambda: all_generated)
        assert demo.fixtures_origin() == demo.ORIGIN_GENERATED
        mixed = (replace(fixtures[0], origin=demo.ORIGIN_PLACEHOLDER),) + all_generated[1:]
        monkeypatch.setattr(demo, 'load_fixtures', lambda: mixed)
        assert demo.fixtures_origin() == demo.ORIGIN_PLACEHOLDER

import copy
from unittest.mock import patch

import pytest
from rest_framework import serializers, status

from pages.design_tokens import clean_design_tokens
from pages.models import Page
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

GET_PLAN = 'billing.permissions.get_user_plan'
CHECK_LIMIT = 'billing.permissions.check_page_limit'


class MockPlan:
    name = 'pro'
    max_pages = 100
    max_version_history = 50
    remove_watermark = True


def valid_tokens():
    return {
        'colors': {
            'primary': '#4f46e5', 'secondary': '#8b5cf6', 'accent': '#6366f1',
            'background': '#fff', 'surface': '#f9fafb', 'text_primary': '#18181b',
            'text_secondary': '#71717a', 'text_on_primary': '#ffffff',
            'border': '#e4e4e7cc', 'success': '#10b981', 'error': '#ef4444',
        },
        'typography': {
            'heading_font': 'Playfair Display', 'body_font': 'Inter', 'base_size': 16,
            'scale_ratio': 1.25, 'heading_weight': 700, 'body_weight': 400,
            'line_height_heading': 1.2, 'line_height_body': 1.6,
        },
        'spacing': {'section_padding_y': '80px', 'section_padding_x': '1.5rem', 'max_content_width': '1200px'},
        'borders': {'radius_sm': '4px', 'radius_md': '8px', 'radius_lg': '16px', 'radius_full': '9999px'},
    }


class TestCleanDesignTokens:
    def test_complete_tokens_pass_unchanged(self):
        tokens = valid_tokens()
        assert clean_design_tokens(copy.deepcopy(tokens)) == tokens

    def test_empty_means_no_tokens(self):
        assert clean_design_tokens({}) == {}
        assert clean_design_tokens(None) == {}

    def test_partial_tokens_are_accepted(self):
        assert clean_design_tokens({'colors': {'primary': '#000'}}) == {'colors': {'primary': '#000'}}

    def test_unknown_groups_and_keys_are_dropped(self):
        cleaned = clean_design_tokens({
            'colors': {'primary': '#000000', 'sparkle': '#ffffff'},
            'extra': {'a': 1},
        })
        assert cleaned == {'colors': {'primary': '#000000'}}

    @pytest.mark.parametrize('value', [
        'red', 'rgb(0,0,0)', '#12', '#12345', '#1234567', '#gggggg', '000000',
        'url(javascript:alert(1))', '#fff;background:red', '#fff}', '', None, 12, ['#fff'],
    ])
    def test_invalid_colors_are_rejected(self, value):
        with pytest.raises(serializers.ValidationError) as exc:
            clean_design_tokens({'colors': {'primary': value}})
        assert 'primary' in exc.value.detail['colors']

    @pytest.mark.parametrize('color', ['#abc', '#ABCDEF', '#aabbccdd'])
    def test_hex_colors_in_three_six_and_eight_digits(self, color):
        assert clean_design_tokens({'colors': {'border': color}}) == {'colors': {'border': color}}

    @pytest.mark.parametrize('font', ['Comic Sans MS', 'inter', "Inter'; } body { x", '', None, 3])
    def test_fonts_outside_the_list_are_rejected(self, font):
        with pytest.raises(serializers.ValidationError):
            clean_design_tokens({'typography': {'body_font': font}})

    @pytest.mark.parametrize('key, value', [
        ('base_size', 9), ('base_size', 33), ('base_size', 16.5), ('base_size', True), ('base_size', '16'),
        ('scale_ratio', 1.3), ('scale_ratio', 0), ('scale_ratio', '1.25'),
        ('heading_weight', 50), ('heading_weight', 950), ('heading_weight', 450), ('body_weight', True),
        ('line_height_heading', 0.5), ('line_height_body', 3.5), ('line_height_body', '1.6'),
    ])
    def test_numbers_outside_their_range_are_rejected(self, key, value):
        with pytest.raises(serializers.ValidationError):
            clean_design_tokens({'typography': {key: value}})

    @pytest.mark.parametrize('ratio', [1.2, 1.25, 1.333, 1.5, 1.618])
    def test_every_scale_ratio_of_the_editor_is_accepted(self, ratio):
        assert clean_design_tokens({'typography': {'scale_ratio': ratio}})

    @pytest.mark.parametrize('group, key, value', [
        ('spacing', 'section_padding_y', 'calc(1px)'),
        ('spacing', 'section_padding_y', '80'),
        ('spacing', 'max_content_width', '99999px'),
        ('spacing', 'max_content_width', '1200px; color: red'),
        ('borders', 'radius_sm', 'url(x)'),
        ('borders', 'radius_md', '-4px'),
        ('borders', 'radius_full', 8),
    ])
    def test_unsafe_lengths_are_rejected(self, group, key, value):
        with pytest.raises(serializers.ValidationError):
            clean_design_tokens({group: {key: value}})

    def test_errors_name_every_invalid_field(self):
        with pytest.raises(serializers.ValidationError) as exc:
            clean_design_tokens({
                'colors': {'primary': 'red', 'accent': '#fff'},
                'borders': {'radius_sm': 'big'},
            })
        assert set(exc.value.detail) == {'colors', 'borders'}
        assert set(exc.value.detail['colors']) == {'primary'}

    def test_wrong_container_types_are_rejected(self):
        with pytest.raises(serializers.ValidationError):
            clean_design_tokens([])
        with pytest.raises(serializers.ValidationError):
            clean_design_tokens({'colors': 'red'})


@pytest.mark.django_db
class TestDesignTokensApi:
    def _put(self, client, page, **fields):
        page.refresh_from_db()
        body = {'name': page.name, 'blocks': [], 'version': page.version, **fields}
        return client.put(f'/api/pages/{page.id}/', body, format='json')

    def test_valid_tokens_are_saved(self, auth_client, page):
        resp = self._put(auth_client, page, design_tokens=valid_tokens())

        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.design_tokens == valid_tokens()

    def test_invalid_tokens_return_400_with_error_and_code(self, auth_client, page):
        resp = self._put(auth_client, page, design_tokens={'colors': {'primary': 'red'}})

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data['code'] == 'BAD_REQUEST'
        assert resp.data['error']
        assert 'primary' in resp.data['details']['design_tokens']['colors']
        page.refresh_from_db()
        assert page.design_tokens == {}

    def test_unknown_keys_are_dropped_on_save(self, auth_client, page):
        resp = self._put(auth_client, page, design_tokens={'colors': {'primary': '#000', 'bogus': 'x'}, 'bogus': {}})

        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.design_tokens == {'colors': {'primary': '#000'}}

    @patch(CHECK_LIMIT)
    def test_create_validates_tokens_too(self, _limit, auth_client):
        bad = auth_client.post('/api/pages/', {
            'name': 'Bad', 'blocks': [], 'design_tokens': {'typography': {'body_font': 'Papyrus'}},
        }, format='json')
        good = auth_client.post('/api/pages/', {
            'name': 'Good', 'blocks': [], 'design_tokens': valid_tokens(),
        }, format='json')

        assert bad.status_code == status.HTTP_400_BAD_REQUEST
        assert good.status_code == status.HTTP_201_CREATED
        assert good.data['design_tokens'] == valid_tokens()

    def test_legacy_theme_fields_are_ignored_and_not_returned(self, auth_client, page):
        resp = self._put(auth_client, page, theme_id='dark', custom_theme={'primary': '#000'})

        assert resp.status_code == status.HTTP_200_OK
        assert 'theme_id' not in resp.data
        assert 'custom_theme' not in resp.data

    def test_tokens_are_not_overwritten_by_a_save_without_them(self, auth_client, page):
        self._put(auth_client, page, design_tokens=valid_tokens())
        self._put(auth_client, page)

        page.refresh_from_db()
        assert page.design_tokens == valid_tokens()

    @patch(CHECK_LIMIT)
    @patch(GET_PLAN, return_value=MockPlan())
    def test_duplicate_copies_the_tokens(self, _plan, _limit, auth_client, page):
        page.design_tokens = valid_tokens()
        page.save()

        resp = auth_client.post(f'/api/pages/{page.id}/duplicate/')

        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['design_tokens'] == valid_tokens()

    @patch(GET_PLAN, return_value=MockPlan())
    def test_publish_freezes_the_tokens_for_the_public_page(self, _plan, auth_client, api_client, page):
        BlockFactory(page=page, type='hero', order=0)
        page.design_tokens = valid_tokens()
        page.save()
        auth_client.post(f'/api/pages/{page.id}/publish/')

        edited = copy.deepcopy(valid_tokens())
        edited['colors']['primary'] = '#000000'
        self._put(auth_client, page, design_tokens=edited)

        public = api_client.get(f'/api/public/pages/{page.slug}/')
        assert public.status_code == status.HTTP_200_OK
        assert public.data['design_tokens'] == valid_tokens()
        assert 'theme_id' not in public.data

    @patch(GET_PLAN, return_value=MockPlan())
    def test_restore_with_metadata_brings_back_the_tokens(self, _plan, auth_client, user, page):
        page.design_tokens = valid_tokens()
        page.save()
        version = PageVersionFactory(
            page=page, version_number=1, created_by=user,
            snapshot=[], page_metadata={'name': page.name, 'design_tokens': valid_tokens()},
        )
        Page.objects.filter(pk=page.pk).update(design_tokens={'colors': {'primary': '#000000'}})

        resp = auth_client.post(f'/api/pages/{page.id}/versions/{version.id}/restore/?restore_metadata=true')

        assert resp.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.design_tokens == valid_tokens()

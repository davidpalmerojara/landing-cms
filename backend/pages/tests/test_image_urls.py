"""QA-005: an image URL ends up inside CSS (`background-image: url(...)`).

`https://x.test/a.png);position:fixed;...` closed the `url(` and added a
declaration that covered the page, including the guest notice (ADR-022).
Image URLs are now strict, and so is og_image. QA-080 / QA-103: the custom
HTML sanitizer drops code elements with their content and the `target`
attribute.
"""
import importlib

import pytest
from rest_framework import serializers

from pages.block_sanitizers import sanitize_custom_html, validate_safe_image_url
from pages.block_validators import clean_block_data
from tests.factories import BlockFactory, PageFactory, PageVersionFactory

migration = importlib.import_module('pages.migrations.0018_plain_text_and_safe_image_urls')

INJECTION = 'https://x.test/a.png);position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647'

IMAGE_FIELDS = [
    pytest.param('hero', lambda url: {'backgroundImage': url}, id='hero.backgroundImage'),
    pytest.param('gallery', lambda url: {'images': [{'src': url, 'alt': ''}]}, id='gallery.src'),
    pytest.param('team', lambda url: {'members': [{'name': 'N', 'role': 'R', 'image': url}]}, id='team.image'),
    pytest.param('navbar', lambda url: {'logoImage': url}, id='navbar.logoImage'),
]

ACCEPTED = [
    '',
    'https://images.example.com/a.png',
    'https://localhost:8001/media/assets/2026/10/abc.jpg',
    'https://cdn.example.com/a.png?w=800&h=600#top',
    'https://cdn.example.com/a%20b%28c%29.png',
    '/media/assets/2026/10/abc.jpg',
    '/logo.svg',
]

REJECTED = [
    INJECTION,
    'https://x.test/a.png)',
    'https://x.test/a(1).png',
    'https://x.test/a.png;color:red',
    'https://x.test/"onerror=1',
    "https://x.test/'a'.png",
    'https://x.test/a b.png',
    'https://x.test/a\tb.png',
    'https://x.test/a\\b.png',
    'https://x.test/a{b}.png',
    'https://x.test/<a>.png',
    'https://x.test/`a`.png',
    'javascript:alert',
    'data:image/png;base64,AAAA',
    '//evil.test/a.png',
    'images/a.png',
    'www.example.com/a.png',
    'https://',
    'ftp://x.test/a.png',
    # SEC2-002: the CSP blocks http images, so they would be saved and never shown
    'http://example.com/a.png',
    'HTTP://example.com/a.png',
    'http://localhost:8001/media/assets/2026/10/abc.jpg',
]


@pytest.mark.parametrize('url', ACCEPTED)
def test_accepted_image_urls(url):
    assert validate_safe_image_url(url) == url


@pytest.mark.parametrize('url', REJECTED)
def test_rejected_image_urls(url):
    with pytest.raises(serializers.ValidationError):
        validate_safe_image_url(url)


@pytest.mark.parametrize(('block_type', 'build'), IMAGE_FIELDS)
@pytest.mark.parametrize('url', [INJECTION, 'https://x.test/a.png);position:fixed'])
def test_every_image_field_rejects_the_css_injection(block_type, build, url):
    with pytest.raises(serializers.ValidationError):
        clean_block_data(block_type, build(url))


@pytest.mark.parametrize(('block_type', 'build'), IMAGE_FIELDS)
def test_every_image_field_accepts_a_normal_url(block_type, build):
    clean_block_data(block_type, build('https://images.example.com/a.png'))


def test_the_page_endpoint_rejects_the_injection_in_a_block(auth_client):
    response = auth_client.post('/api/pages/', {
        'name': 'Overlay',
        'blocks': [{'type': 'hero', 'data': {'title': 'T', 'backgroundImage': INJECTION}, 'styles': {}}],
    }, format='json')
    assert response.status_code == 400
    assert 'backgroundImage' in str(response.data['details'])


def test_og_image_rejects_the_injection_and_accepts_a_normal_url(auth_client, page):
    url = f'/api/pages/{page.id}/'
    bad = auth_client.put(url, {'name': page.name, 'blocks': [], 'og_image': INJECTION, 'version': page.version},
                          format='json')
    assert bad.status_code == 400
    assert 'og_image' in bad.data['details']
    good = auth_client.put(url, {'name': page.name, 'blocks': [], 'og_image': 'https://x.test/og.png',
                                 'version': page.version}, format='json')
    assert good.status_code == 200, good.data
    assert good.data['og_image'] == 'https://x.test/og.png'


@pytest.mark.parametrize('og_image, expected', [
    ('/media/assets/2026/10/og.png', 200),  # SEC2-006: an uploaded image is a site path
    ('http://x.test/og.png', 400),  # SEC2-002
    ('//evil.test/og.png', 400),
])
def test_og_image_takes_the_same_urls_as_block_images(auth_client, page, og_image, expected):
    response = auth_client.put(f'/api/pages/{page.id}/', {
        'name': page.name, 'blocks': [], 'og_image': og_image, 'version': page.version,
    }, format='json')
    assert response.status_code == expected, response.data
    if expected == 200:
        assert response.data['og_image'] == og_image


# --- migration 0018, URLs ----------------------------------------------------

def test_convert_block_data_empties_the_urls_that_would_not_save():
    data = {'title': 'T', 'backgroundImage': INJECTION}
    assert migration.convert_block_data('hero', data) == {'title': 'T', 'backgroundImage': ''}
    assert migration.convert_block_data('hero', {'backgroundImage': 'https://x.test/a.png'}) == {
        'backgroundImage': 'https://x.test/a.png',
    }


def test_convert_block_data_reaches_list_items():
    data = {'images': [{'src': 'https://x.test/ok.png', 'alt': 'a'}, {'src': 'https://x.test/a.png)x', 'alt': 'b'}]}
    assert migration.convert_block_data('gallery', data)['images'] == [
        {'src': 'https://x.test/ok.png', 'alt': 'a'}, {'src': '', 'alt': 'b'},
    ]


def test_convert_metadata_fixes_og_type_and_og_image_and_adds_a_language():
    metadata = {'name': 'N', 'og_type': 'product', 'og_image': INJECTION}
    assert migration.convert_metadata(metadata) == {
        'name': 'N', 'og_type': 'website', 'og_image': '', 'language': 'es',
    }
    done = {'og_type': 'article', 'og_image': 'https://x.test/o.png', 'language': 'en'}
    assert migration.convert_metadata(done) is None
    assert migration.convert_metadata('not a dict') is None


@pytest.mark.django_db
def test_migration_cleans_rows_blocks_snapshots_and_page_fields():
    from pages.tests.test_plain_text_fields import _historical_apps, _snapshot_of

    page = PageFactory(status='published', og_type='product', og_image=INJECTION)
    other = PageFactory(og_type='article', og_image='https://x.test/o.png')
    hero = BlockFactory(page=page, type='hero', data={'title': 'T', 'backgroundImage': INJECTION})
    version = PageVersionFactory(
        page=page, snapshot=_snapshot_of([hero]), page_metadata={'og_type': 'product', 'og_image': INJECTION},
    )

    migration.convert_stored_content(_historical_apps(), None)

    hero.refresh_from_db()
    version.refresh_from_db()
    page.refresh_from_db()
    other.refresh_from_db()
    assert hero.data['backgroundImage'] == ''
    assert version.snapshot[0]['data']['backgroundImage'] == ''
    assert version.page_metadata == {'og_type': 'website', 'og_image': '', 'language': 'es'}
    assert (page.og_type, page.og_image) == ('website', '')
    assert (other.og_type, other.og_image) == ('article', 'https://x.test/o.png')


# --- custom HTML (QA-080, QA-103) -------------------------------------------

@pytest.mark.parametrize(('html', 'expected'), [
    ('<script>alert(1)</script>', ''),
    ('<p>a</p><script>alert(1)</script><p>b</p>', '<p>a</p><p>b</p>'),
    ('<style>body{display:none}</style><p>x</p>', '<p>x</p>'),
    ('<noscript>hidden</noscript>ok', 'ok'),
    ('<template><p>t</p></template>ok', 'ok'),
    ('<SCRIPT type="x">alert(1)</SCRIPT >ok', 'ok'),
    ('<script>never closed', ''),
    ('<scr<script>x</script>ipt>alert(1)</script>ok', 'ok'),
])
def test_custom_html_drops_code_elements_with_their_content(html, expected):
    assert sanitize_custom_html(html) == expected


def test_custom_html_sanitizing_twice_gives_the_same_result():
    once = sanitize_custom_html('<p>a &amp; b</p><script>x</script><img src="https://x.test/a.png" alt="i">')
    assert sanitize_custom_html(once) == once


def test_custom_html_links_cannot_target_the_top_window():
    result = sanitize_custom_html('<a href="https://x.test" target="_top" rel="noopener">go</a>')
    assert 'target' not in result
    assert 'href="https://x.test"' in result


# --- custom HTML media over http (SEC3-002) ----------------------------------

@pytest.mark.parametrize(('html', 'expected'), [
    ('<img src="http://x.test/a.png" alt="i">', '<img src="https://x.test/a.png" alt="i">'),
    ('<img src="HTTP://x.test/a.png">', '<img src="https://x.test/a.png">'),
    ('<video src="http://x.test/v.mp4" poster="http://x.test/p.png" controls></video>',
     '<video src="https://x.test/v.mp4" poster="https://x.test/p.png" controls></video>'),
    ('<video><source src="http://x.test/v.mp4" type="video/mp4"></video>',
     '<video><source src="https://x.test/v.mp4" type="video/mp4"></video>'),
    ('<img src="https://x.test/a.png">', '<img src="https://x.test/a.png">'),
    # Links are not loaded by the page: they keep http
    ('<a href="http://x.test/">go</a>', '<a href="http://x.test/">go</a>'),
])
def test_custom_html_media_is_upgraded_to_https(html, expected):
    # SEC3-002: the CSP blocks http images and media, so the sanitizer upgrades them
    assert sanitize_custom_html(html) == expected
    assert sanitize_custom_html(expected) == expected

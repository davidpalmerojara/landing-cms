import html
import re
import bleach
from bleach.css_sanitizer import CSSSanitizer
from rest_framework import serializers

ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']

CUSTOM_HTML_ALLOWED_TAGS = [
    'strong', 'em', 'a', 'br', 'ul', 'ol', 'li', 'p', 'span',
    'div', 'section', 'article', 'header', 'footer', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'video', 'source', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code', 'hr', 'figure', 'figcaption',
]
CUSTOM_HTML_ALLOWED_ATTRIBUTES = {
    # No "target": a link could send the whole window away ("_top"). The block
    # renders in a sandboxed iframe whose <base target="_blank"> opens links in a new tab.
    'a': ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    'video': ['src', 'controls', 'autoplay', 'muted', 'loop', 'poster'],
    'source': ['src', 'type'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    '*': ['class', 'id', 'style'],
}
CUSTOM_HTML_CSS_SANITIZER = CSSSanitizer(
    allowed_css_properties=[
        'color', 'background-color', 'font-weight', 'font-style', 'text-decoration',
        'text-align', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'display', 'width', 'height', 'max-width', 'border', 'border-radius',
    ]
)


def _strip_tags_once(value):
    # bleach escapes <, > and &, and keeps entities it finds as they are. Escaping
    # every & first makes the entities the user typed plain text, so the single
    # unescape below only undoes what this function itself escaped.
    escaped = bleach.clean(value.replace('&', '&amp;'), tags=[], attributes={}, strip=True)
    return html.unescape(escaped)


def sanitize_plain_text(value):
    """Strip all HTML from a plain text field and store the result as text.

    bleach returns HTML-escaped output ("<10ms" -> "&lt;10ms"). These fields
    are rendered by React as text, which escapes on output, so storing
    entities made them show up literally. Unescaping is safe as long as plain
    text fields are never injected as HTML.

    Idempotent: sanitizing a stored value gives the same value, so saving a
    page again never changes it. Text the user typed stays as typed, including
    a literal "&lt;", which is not decoded.
    """
    if not isinstance(value, str):
        return value
    cleaned = _strip_tags_once(value)
    # Removing a tag can join the text around it into a new tag ("<<b>script>"):
    # repeat until nothing changes. Each pass only removes characters, so it ends.
    while '<' in cleaned:
        again = _strip_tags_once(cleaned)
        if again == cleaned:
            break
        cleaned = again
    return cleaned


# Elements whose content is code or hidden markup, not text. bleach drops the
# tags but would leave their content behind as visible text.
_NON_TEXT_ELEMENTS = re.compile(
    r'<(script|style|noscript|template)\b[^>]*>.*?(?:</\1\s*>|\Z)',
    re.IGNORECASE | re.DOTALL,
)


def _remove_non_text_elements(value):
    # Removing one element can join the text around it into another one: repeat
    # until nothing changes (each pass only removes characters, so it ends).
    while True:
        cleaned = _NON_TEXT_ELEMENTS.sub('', value)
        if cleaned == value:
            return cleaned
        value = cleaned


def sanitize_custom_html(value):
    """Sanitize the free-form custom HTML block with a wider safe whitelist."""
    if not isinstance(value, str):
        return value
    return bleach.clean(
        _remove_non_text_elements(value),
        tags=CUSTOM_HTML_ALLOWED_TAGS,
        attributes=CUSTOM_HTML_ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=CUSTOM_HTML_CSS_SANITIZER,
        strip=True,
    )


# An image URL ends up inside CSS (`background-image: url(...)`) as well as in
# `src`, so it must not be able to close the `url(`, open a string, start a new
# declaration or block, or smuggle markup: quotes, parentheses, `;`, braces,
# angle brackets, backticks, backslashes, whitespace and control characters
# are refused (QA-005). Encode them (%28, %29...) if a file name really has them.
_IMAGE_URL_FORBIDDEN_CHARS = re.compile(r'[\s\x00-\x20\x7f-\x9f\\\'"()<>;{}`]')
# https only: pages are served over https and their CSP (img-src) blocks http
# images, so an http:// address would be saved and never shown (SEC2-002)
_IMAGE_URL_ABSOLUTE = re.compile(r'https://[^/?#].*', re.IGNORECASE)


def validate_safe_image_url(value):
    """Validate the URL of an image: https://host/... or a site-relative path
    ("/media/assets/a.png", not "//host"). Empty is allowed."""
    if value in (None, ''):
        return value
    if not isinstance(value, str):
        raise serializers.ValidationError('URL inválida.')
    if _IMAGE_URL_FORBIDDEN_CHARS.search(value):
        raise serializers.ValidationError(
            'La URL de la imagen no puede contener espacios, comillas, paréntesis, ";" ni otros caracteres especiales. '
            'Codifícalos (por ejemplo %28 y %29) o sube la imagen.'
        )
    if value.startswith('/') and not value.startswith('//'):
        return value
    if _IMAGE_URL_ABSOLUTE.fullmatch(value):
        return value
    raise serializers.ValidationError('URL de imagen no permitida. Usa una dirección https:// o una ruta que empiece por /.')


# Whitespace, control characters (incl. NUL, DEL, C1) and backslash anywhere in
# a link are rejected instead of trimmed: browsers strip tabs/newlines inside
# a scheme ("java\tscript:") and treat a backslash as a slash ("/\evil.com").
_LINK_FORBIDDEN_CHARS = re.compile(r'[\s\x00-\x20\x7f-\x9f\\]')
# A scheme followed by at least one more character (a host for http/https)
_LINK_ABSOLUTE = re.compile(r'(?:https?://[^/?#].*|mailto:.+|tel:.+)', re.IGNORECASE)


def validate_safe_link(value):
    """Validate an href typed by the user.

    Accepted: http(s)://host..., mailto:..., tel:..., site-relative paths
    ("/pricing", not "//host") and in-page anchors ("#features"). Empty is
    allowed. Everything else (javascript:, data:, vbscript:, protocol-relative
    URLs, any whitespace or control character) is rejected.
    """
    if value in (None, ''):
        return value
    if not isinstance(value, str):
        raise serializers.ValidationError('Enlace inválido.')
    if _LINK_FORBIDDEN_CHARS.search(value):
        raise serializers.ValidationError('El enlace no puede contener espacios ni caracteres de control.')
    if value.startswith('#'):
        return value
    if value.startswith('/') and not value.startswith('//'):
        return value
    if _LINK_ABSOLUTE.fullmatch(value):
        return value
    raise serializers.ValidationError(
        'Enlace no permitido. Usa https://, http://, mailto:, tel:, una ruta que empiece por / o un ancla #.'
    )


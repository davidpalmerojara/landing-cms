import html
import re
from urllib.parse import urlparse

import bleach
from bleach.css_sanitizer import CSSSanitizer
from rest_framework import serializers

ALLOWED_TAGS = ['strong', 'em', 'a', 'br', 'ul', 'ol', 'li', 'p', 'span']
ALLOWED_ATTRIBUTES = {'a': ['href', 'title', 'target', 'rel']}
ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']

CUSTOM_HTML_ALLOWED_TAGS = ALLOWED_TAGS + [
    'div', 'section', 'article', 'header', 'footer', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'video', 'source', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code', 'hr', 'figure', 'figcaption',
]
CUSTOM_HTML_ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target', 'rel'],
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


def sanitize_text(value):
    """Allow a small safe subset of formatting tags."""
    if not isinstance(value, str):
        return value
    return bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
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


def sanitize_custom_html(value):
    """Sanitize the free-form custom HTML block with a wider safe whitelist."""
    if not isinstance(value, str):
        return value
    return bleach.clean(
        value,
        tags=CUSTOM_HTML_ALLOWED_TAGS,
        attributes=CUSTOM_HTML_ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=CUSTOM_HTML_CSS_SANITIZER,
        strip=True,
    )


def validate_safe_url(value):
    if value in (None, ''):
        return value
    if not isinstance(value, str):
        raise serializers.ValidationError('URL inválida.')

    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https', ''):
        raise serializers.ValidationError(f'URL no permitida: {value}')
    return value


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


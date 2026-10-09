/**
 * Links typed by the user (buttons, nav items). Mirrors the server rule in
 * backend/pages/block_sanitizers.py (validate_safe_link): the server is the
 * real gate, this check keeps an unsafe value from ever becoming an href if
 * stored data is stale or came through another path.
 *
 * Accepted: http(s)://host..., mailto:, tel:, site paths ("/x", not "//x")
 * and in-page anchors ("#x"). Whitespace, control characters and backslashes
 * are rejected, never trimmed.
 */
const MAX_LINK_LENGTH = 2000;
// Whitespace, control characters (incl. DEL and C1) and backslash
const FORBIDDEN_CHARS = /[\s\u0000- \u007f-\u009f\\]/;
const ABSOLUTE_LINK = /^(?:https?:\/\/[^/?#].*|mailto:.+|tel:.+)$/i;
const HTTP_LINK = /^https?:\/\//i;

export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || value.length > MAX_LINK_LENGTH) return null;
  if (FORBIDDEN_CHARS.test(value)) return null;
  if (value.startsWith('#')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (ABSOLUTE_LINK.test(value)) return value;
  return null;
}

/** http(s) links leave the site and get rel="noopener noreferrer". */
export function isExternalHref(href: string): boolean {
  return HTTP_LINK.test(href);
}

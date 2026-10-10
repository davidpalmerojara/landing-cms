/**
 * The image URLs the server accepts (ADR-034, `validate_safe_image_url`):
 * `http(s)://host/...` or a path on this site (`/media/...`, not `//host`),
 * with no spaces, control characters, quotes, parentheses, `;`, braces,
 * angle brackets, backticks or backslashes. Checked here first so the user
 * gets the reason at once; the server checks again.
 */
const FORBIDDEN_CHARS = new Set(['\\', "'", '"', '(', ')', '<', '>', ';', '{', '}', '`']);
const ABSOLUTE = /^https?:\/\/[^/?#]/i;

function hasForbiddenChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    // Whitespace and control characters, C1 included
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || /\s/.test(char)) return true;
    if (FORBIDDEN_CHARS.has(char)) return true;
  }
  return false;
}

export function isAllowedImageUrl(value: string): boolean {
  if (!value || hasForbiddenChar(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return ABSOLUTE.test(value);
}

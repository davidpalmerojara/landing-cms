import { describe, it, expect } from 'vitest';
import { isExternalHref, safeHref } from '@/lib/safe-link';

describe('safeHref', () => {
  it.each([
    'https://example.com',
    'https://example.com/path?x=1&y=2#frag',
    'http://example.com',
    'HTTPS://EXAMPLE.COM/Path',
    'mailto:hola@example.com',
    'mailto:hola@example.com?subject=Hola%20mundo',
    'tel:+34600123456',
    '/',
    '/precios',
    '/p/mi-pagina?ref=nav',
    '#',
    '#features',
  ])('accepts %s', (value) => {
    expect(safeHref(value)).toBe(value);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'javascript:alert(1) ',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'java\u0000script:alert(1)',
    '\u0001javascript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    '//evil.com',
    '//evil.com/path',
    '/\\evil.com',
    '\\\\evil.com',
    '/ /evil.com',
    '/\t/evil.com',
    ' https://example.com',
    'https://example.com ',
    'https://exa mple.com',
    'https://',
    'mailto:',
    'tel:',
    'example.com',
    'pricing',
    '?x=1',
    'https:example.com',
  ])('rejects %j', (value) => {
    expect(safeHref(value)).toBeNull();
  });

  it('returns null for empty and non-string values', () => {
    expect(safeHref('')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(42)).toBeNull();
    expect(safeHref(['https://example.com'])).toBeNull();
  });

  it('rejects links over 2000 characters', () => {
    const atLimit = `https://example.com/${'a'.repeat(1980)}`;
    expect(atLimit).toHaveLength(2000);
    expect(safeHref(atLimit)).toBe(atLimit);
    expect(safeHref(`${atLimit}a`)).toBeNull();
  });
});

describe('isExternalHref', () => {
  it('is true only for http(s) links', () => {
    expect(isExternalHref('https://example.com')).toBe(true);
    expect(isExternalHref('HTTP://example.com')).toBe(true);
    expect(isExternalHref('/precios')).toBe(false);
    expect(isExternalHref('#features')).toBe(false);
    expect(isExternalHref('mailto:hola@example.com')).toBe(false);
    expect(isExternalHref('tel:+34600123456')).toBe(false);
  });
});

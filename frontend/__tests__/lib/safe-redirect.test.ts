import { describe, it, expect } from 'vitest';
import { nextPathFromLocation, safeNextPath } from '@/lib/safe-redirect';

describe('safeNextPath', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/editor/abc')).toBe('/editor/abc');
    expect(safeNextPath('/settings?tab=billing')).toBe('/settings?tab=billing');
  });

  it('keeps the query and the hash of an internal path', () => {
    expect(safeNextPath('/editor/1?x=1#y')).toBe('/editor/1?x=1#y');
  });

  it.each([null, '', 'editor/abc', '//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)'])(
    'falls back to the dashboard for %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/dashboard');
    },
  );

  // QA-026: the URL parser removes tabs and line breaks, so these become "//evil.example"
  it.each([
    ['a tab between the slashes', '/\t/evil.example'],
    ['a line feed between the slashes', '/\n/evil.example'],
    ['a carriage return between the slashes', '/\r/evil.example'],
    ['an encoded tab', '/%09/evil.example'],
    ['an encoded line feed', '/%0a/evil.example'],
    ['an encoded double slash', '/%2F%2Fevil.example'],
    ['a space', '/ /evil.example'],
    ['a NUL', '/\u0000/evil.example'],
  ])('QA-026: falls back for %s', (_label, value) => {
    expect(safeNextPath(value)).toBe('/dashboard');
  });

  it('QA-026: the open redirect of the report is closed end to end (?next=/%09/evil.example)', () => {
    window.history.replaceState(null, '', '/login?next=/%09/evil.example');
    expect(nextPathFromLocation()).toBe('/dashboard');

    window.history.replaceState(null, '', '/login?next=/editor/9%3Ftab%3D1');
    expect(nextPathFromLocation()).toBe('/editor/9?tab=1');
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('//evil.com', '/settings')).toBe('/settings');
  });
});

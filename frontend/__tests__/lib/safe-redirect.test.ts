import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safe-redirect';

describe('safeNextPath', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/editor/abc')).toBe('/editor/abc');
    expect(safeNextPath('/settings?tab=billing')).toBe('/settings?tab=billing');
  });

  it.each([null, '', 'editor/abc', '//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)'])(
    'falls back to the dashboard for %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/dashboard');
    },
  );
});

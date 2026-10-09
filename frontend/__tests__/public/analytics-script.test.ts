import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'public', 'bp-analytics.js'), 'utf8');

describe('bp-analytics.js is cookieless', () => {
  it('uses no browser storage', () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it('sends no visitor identifier or user agent', () => {
    expect(source).not.toMatch(/visitor_id|user_agent|navigator\.userAgent/);
  });

  it('does not send the full URL or the clicked text', () => {
    expect(source).not.toMatch(/location\.href\s*}/);
    expect(source).not.toMatch(/textContent/);
  });
});

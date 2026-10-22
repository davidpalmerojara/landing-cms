// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { SITE_URL } from '@/lib/site-url';

afterEach(() => {
  vi.unstubAllGlobals();
});

function serveSitemapData(pages: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(pages), { status: 200 })));
}

describe('product sitemap', () => {
  it('SEC-006: lists only this site\'s own /p/<slug> addresses, never an author\'s canonical URL', async () => {
    // An older backend still sends the canonical URL the author typed
    serveSitemapData([{ slug: 'mi-pagina', updated_at: '2026-10-20T10:00:00Z', seo_canonical_url: 'https://evil.example/x' }]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/p/mi-pagina`);
    expect(urls.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('still lists the product pages when the backend is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/pricing`);
  });
});

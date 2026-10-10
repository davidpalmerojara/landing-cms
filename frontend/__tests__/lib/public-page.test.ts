// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPublicPage } from '@/lib/api';
import { fallbackDescription, ogTypeOf, publicPageMetadata } from '@/lib/public-metadata';
import { PUBLIC_SLUG_HEADER, publicSlugFromPath, withPublicSlug } from '@/lib/public-page-request';
import { pageLanguage, pageMessagesLocale } from '@/lib/page-language';

// A stand-in for Next's data cache: results kept by key, dropped by tag
const cacheStore = new Map<string, unknown>();
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options: { tags: string[]; revalidate: number }) => async () => {
    const key = JSON.stringify([keyParts, options.tags]);
    if (cacheStore.has(key)) return cacheStore.get(key);
    const value = await fn();
    cacheStore.set(key, value);
    return value;
  },
}));

function page(overrides: Partial<ApiPublicPage> = {}): ApiPublicPage {
  return {
    id: 'p1', slug: 'x', status: 'published', name: 'Mi página', blocks: [], published_at: null, updated_at: null, show_watermark: false,
    ...overrides,
  };
}

describe('getPublicPage', () => {
  beforeEach(() => cacheStore.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('caches "no such page" too, so unknown slugs stop reaching Django (QA-006)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getPublicPage } = await import('@/lib/public-page');

    expect(await getPublicPage('nadie')).toBeNull();
    expect(await getPublicPage('nadie')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PUBLIC2-004: an unknown slug leaves nothing in the data cache, and the table of misses is bounded', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getPublicPage } = await import('@/lib/public-page');

    for (let i = 0; i < 600; i += 1) await getPublicPage(`aleatorio-${i}`);

    expect(cacheStore.size).toBe(0);
    // The oldest entries were forgotten, the newest are still answered from memory
    fetchMock.mockClear();
    await getPublicPage('aleatorio-599');
    expect(fetchMock).not.toHaveBeenCalled();
    await getPublicPage('aleatorio-0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PUBLIC2-004: publishing a slug that was missing is seen at once, and a found page is still cached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getPublicPage, forgetMissingPage } = await import('@/lib/public-page');
    expect(await getPublicPage('pronto')).toBeNull();

    forgetMissingPage('pronto');
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page({ slug: 'pronto' })), { status: 200 }));

    expect((await getPublicPage('pronto'))?.slug).toBe('pronto');
    expect(cacheStore.size).toBe(1);
  });

  it('never caches a server error: it throws, and the next visit asks again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getPublicPage } = await import('@/lib/public-page');

    await expect(getPublicPage('roto')).rejects.toThrow('500');
    await expect(getPublicPage('roto')).rejects.toThrow('500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('published page metadata', () => {
  it('turns an Open Graph type the server no longer accepts into "website" (QA-009)', () => {
    expect(ogTypeOf('product')).toBe('website');
    expect(ogTypeOf(undefined)).toBe('website');
    expect(ogTypeOf('article')).toBe('article');
    const metadata = publicPageMetadata(page({ og_type: 'product' }), 'Hecho con Paxl');
    expect(metadata.openGraph).toMatchObject({ type: 'website' });
  });

  it('falls back to "<name> - Made with Paxl" when the hero is there but empty (QA-118)', () => {
    const hero = { id: 'h', type: 'hero', order: 0, data: { title: '  ', subtitle: '' }, styles: {} };
    expect(fallbackDescription(page({ blocks: [hero] }), 'Hecho con Paxl')).toBe('Mi página - Hecho con Paxl');
    expect(publicPageMetadata(page({ blocks: [hero] }), 'Hecho con Paxl').description).toBe('Mi página - Hecho con Paxl');
    const filled = { ...hero, data: { title: 'Título', subtitle: '' } };
    expect(fallbackDescription(page({ blocks: [filled] }), 'Hecho con Paxl')).toBe('Título');
  });
});

describe('the published page\'s language reaches <html lang> (QA-091)', () => {
  it('the proxy reads the slug of a published-page path only', () => {
    expect(publicSlugFromPath('/p/mi-landing')).toBe('mi-landing');
    expect(publicSlugFromPath('/p/mi-landing/')).toBe('mi-landing');
    expect(publicSlugFromPath('/dashboard')).toBeNull();
    expect(publicSlugFromPath('/p/a/b')).toBeNull();
  });

  it('the header can never come from the browser', () => {
    const spoofed = new Headers({ [PUBLIC_SLUG_HEADER]: 'otra', accept: 'text/html' });
    expect(withPublicSlug(spoofed, null).has(PUBLIC_SLUG_HEADER)).toBe(false);
    expect(withPublicSlug(spoofed, 'mia').get(PUBLIC_SLUG_HEADER)).toBe('mia');
    expect(withPublicSlug(spoofed, null).get('accept')).toBe('text/html');
  });

  it('a missing or malformed language falls back to Spanish, as on the server', () => {
    expect(pageLanguage('pt-BR')).toBe('pt-BR');
    expect(pageLanguage(undefined)).toBe('es');
    expect(pageLanguage('en"><script>')).toBe('es');
  });

  it('Paxl\'s words inside the blocks follow the page when Paxl has them in its language', () => {
    expect(pageMessagesLocale('en-GB')).toBe('en');
    expect(pageMessagesLocale('es')).toBe('es');
    expect(pageMessagesLocale('fr')).toBeNull();
  });
});

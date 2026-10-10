import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, acceptLanguage: null as string | null }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'paxl-locale' && state.cookie ? { value: state.cookie } : undefined) }),
  headers: async () => ({ get: (name: string) => (name === 'accept-language' ? state.acceptLanguage : null) }),
}));

import { routeMetadata } from '@/lib/route-metadata';

beforeEach(() => {
  state.cookie = undefined;
  state.acceptLanguage = null;
});

describe('routeMetadata (QA-057)', () => {
  it('gives every route its own title, in Spanish by default', async () => {
    expect((await routeMetadata('pricing')).title).toBe('Precios — Paxl');
    expect((await routeMetadata('login')).title).toBe('Iniciar sesión — Paxl');
    expect((await routeMetadata('dashboard')).title).toBe('Mis páginas — Paxl');
    expect((await routeMetadata('billing')).title).toBe('Facturación — Paxl');
  });

  it('follows the language cookie, then Accept-Language', async () => {
    state.cookie = 'en';
    expect((await routeMetadata('pricing')).title).toBe('Pricing — Paxl');

    state.cookie = undefined;
    state.acceptLanguage = 'en-US,en;q=0.9';
    expect((await routeMetadata('about')).title).toBe('About — Paxl');
  });

  it('the titles of different routes differ', async () => {
    const titles = await Promise.all((['pricing', 'about', 'contact', 'privacy', 'terms', 'changelog', 'login', 'register'] as const)
      .map(async (route) => (await routeMetadata(route)).title));

    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the root title for the home page, with its canonical address', async () => {
    const metadata = await routeMetadata('home');

    expect(metadata.title).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('/');
  });

  it('pages behind a login are not indexed', async () => {
    expect((await routeMetadata('dashboard')).robots).toEqual({ index: false, follow: false });
    expect((await routeMetadata('pricing')).robots).toBeUndefined();
  });
});

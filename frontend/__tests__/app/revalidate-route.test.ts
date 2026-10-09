// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));

const { POST } = await import('@/app/revalidate/route');

function post(body: unknown, secret: string | null = 'right-secret'): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['X-Revalidate-Secret'] = secret;
  return POST(new Request('http://localhost/revalidate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

describe('POST /revalidate', () => {
  beforeEach(() => {
    vi.stubEnv('REVALIDATE_SECRET', 'right-secret');
    revalidateTag.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('drops the cached copy of each page, with no stale window', async () => {
    const res = await post({ slugs: ['mi-landing', 'otra_pagina-2'] });

    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('public-page:mi-landing', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('public-page:otra_pagina-2', { expire: 0 });
  });

  it.each([
    ['no secret header', null],
    ['a wrong secret', 'wrong-secret'],
    ['a secret of another length', 'right-secret-and-more'],
  ])('answers 404 and revalidates nothing with %s', async (_label, secret) => {
    const res = await post({ slugs: ['mi-landing'] }, secret);

    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('is off when the server has no secret configured', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '');

    const res = await post({ slugs: ['mi-landing'] }, '');

    expect(res.status).toBe(404);
  });

  it.each([
    ['invalid JSON', '{'],
    ['no slugs', {}],
    ['an empty list', { slugs: [] }],
    ['a slug that is not a slug', { slugs: ['../admin'] }],
    ['a non-string slug', { slugs: [42] }],
    ['too many slugs', { slugs: Array.from({ length: 51 }, (_, i) => `p${i}`) }],
  ])('rejects %s', async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

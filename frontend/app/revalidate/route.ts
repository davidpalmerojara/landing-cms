import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { forgetMissingPage, publicPageTag } from '@/lib/public-page';

// Django slugs (SlugField, max_length=200)
const slugPattern = /^[-a-zA-Z0-9_]{1,200}$/;
const maxSlugsPerRequest = 50;

function hasValidSecret(given: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || !given) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(given);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function isSlugList(value: unknown): value is string[] {
  return (
    Array.isArray(value)
    && value.length > 0
    && value.length <= maxSlugsPerRequest
    && value.every((slug) => typeof slug === 'string' && slugPattern.test(slug))
  );
}

/**
 * POST /revalidate — called by the backend after a page is published,
 * unpublished or deleted, so the next visit fetches the new copy (ADR-019).
 * It lives outside /api because /api is rewritten to Django.
 */
export async function POST(request: Request) {
  if (!hasValidSecret(request.headers.get('x-revalidate-secret'))) {
    return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
  }

  const slugs = (body as { slugs?: unknown } | null)?.slugs;
  if (!isSlugList(slugs)) {
    return Response.json({ error: 'Expected a list of page slugs', code: 'INVALID_SLUGS' }, { status: 400 });
  }

  // expire: 0 — the owner just published; the next visit must not get the old copy
  for (const slug of slugs) {
    revalidateTag(publicPageTag(slug), { expire: 0 });
    forgetMissingPage(slug);
  }
  return Response.json({ revalidated: slugs });
}

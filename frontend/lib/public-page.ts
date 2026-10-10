/**
 * Server-side read of a published page, cached by Next's data cache.
 *
 * The backend asks the frontend to drop a page's entry when it is published,
 * unpublished or deleted (POST /revalidate, ADR-019), so visitors see changes
 * right away while repeat visits don't reach Django. The time limit only
 * matters if one of those requests is lost.
 *
 * "No such page" is cached too (QA-006): Next's fetch cache only keeps 200
 * responses, so every request for an unknown slug used to reach Django. The
 * same tag drops it when a page with that slug is published.
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import type { ApiPublicPage } from '@/lib/api';
import { pageLanguage } from '@/lib/page-language';
import { serverApiUrl } from '@/lib/server-api';

export const publicPageRevalidateSeconds = 60;

export function publicPageTag(slug: string): string {
  return `public-page:${slug}`;
}

async function fetchPublicPage(slug: string): Promise<ApiPublicPage | null> {
  const res = await fetch(`${serverApiUrl()}/public/pages/${encodeURIComponent(slug)}/`, { cache: 'no-store' });
  if (res.status === 404) return null;
  // Anything else is a server problem, not a missing page: show an error (never cached), not a 404
  if (!res.ok) throw new Error(`Public page request failed with status ${res.status}`);
  return res.json();
}

/** The published copy, or null when there is no published page with this slug. */
export const getPublicPage = cache((slug: string): Promise<ApiPublicPage | null> =>
  unstable_cache(() => fetchPublicPage(slug), ['public-page', slug], {
    revalidate: publicPageRevalidateSeconds,
    tags: [publicPageTag(slug)],
  })(),
);

/**
 * The `<html lang>` of a published page, or null when there is no such page.
 * A failed read also gives null: the page itself reports the failure, and the
 * root layout falls back to the visitor's language.
 */
export async function publicPageLanguage(slug: string): Promise<string | null> {
  try {
    const page = await getPublicPage(slug);
    return page ? pageLanguage(page.language) : null;
  } catch (error: unknown) {
    console.error('Could not read the language of public page', slug, error);
    return null;
  }
}

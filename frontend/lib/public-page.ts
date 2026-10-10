/**
 * Server-side read of a published page, cached by Next's data cache.
 *
 * The backend asks the frontend to drop a page's entry when it is published,
 * unpublished or deleted (POST /revalidate, ADR-019), so visitors see changes
 * right away while repeat visits don't reach Django. The time limit only
 * matters if one of those requests is lost.
 *
 * "No such page" is remembered too (QA-006), so unknown slugs do not all reach
 * Django, but only in a small in-memory table (PUBLIC2-004): a copy in Next's
 * data cache is one more file on disk per slug, and anyone can ask for as many
 * random slugs as they like. The table is bounded, forgets after a minute, and
 * /revalidate empties a slug's entry when a page with that slug is published.
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

/** Slugs known to have no published page, with the time each entry expires. Newest last. */
const MISSING_PAGES_LIMIT = 500;
const missingPagesKey = Symbol.for('paxl.missingPublicPages');
type MissingPages = Map<string, number>;

// On globalThis: the page and the /revalidate route may be separate module instances in the same process
function missingPages(): MissingPages {
  const holder = globalThis as unknown as Record<symbol, MissingPages | undefined>;
  return (holder[missingPagesKey] ??= new Map());
}

function isKnownMissing(slug: string): boolean {
  const table = missingPages();
  const expires = table.get(slug);
  if (expires === undefined) return false;
  if (expires > Date.now()) return true;
  table.delete(slug);
  return false;
}

function rememberMissing(slug: string): void {
  const table = missingPages();
  table.delete(slug);
  table.set(slug, Date.now() + publicPageRevalidateSeconds * 1000);
  // Maps iterate in insertion order: the first key is the oldest
  while (table.size > MISSING_PAGES_LIMIT) {
    const oldest = table.keys().next().value;
    if (oldest === undefined) break;
    table.delete(oldest);
  }
}

/** A page with this slug may exist now (it was just published): stop answering "not found" from memory. */
export function forgetMissingPage(slug: string): void {
  missingPages().delete(slug);
}

class PublicPageNotFound extends Error {
  constructor() {
    super('No published page with this slug');
    this.name = 'PublicPageNotFound';
  }
}

async function fetchPublicPage(slug: string): Promise<ApiPublicPage> {
  const res = await fetch(`${serverApiUrl()}/public/pages/${encodeURIComponent(slug)}/`, { cache: 'no-store' });
  // Thrown, not returned: Next's data cache keeps only what the function returns
  if (res.status === 404) throw new PublicPageNotFound();
  // Anything else is a server problem, not a missing page: show an error (never cached), not a 404
  if (!res.ok) throw new Error(`Public page request failed with status ${res.status}`);
  return res.json();
}

/** The published copy, or null when there is no published page with this slug. */
export const getPublicPage = cache(async (slug: string): Promise<ApiPublicPage | null> => {
  if (isKnownMissing(slug)) return null;
  try {
    return await unstable_cache(() => fetchPublicPage(slug), ['public-page', slug], {
      revalidate: publicPageRevalidateSeconds,
      tags: [publicPageTag(slug)],
    })();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'PublicPageNotFound') {
      rememberMissing(slug);
      return null;
    }
    throw error;
  }
});

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

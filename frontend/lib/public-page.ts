/**
 * Server-side read of a published page, cached by Next's data cache.
 *
 * The backend asks the frontend to drop a page's entry when it is published,
 * unpublished or deleted (POST /revalidate, ADR-019), so visitors see changes
 * right away while repeat visits don't reach Django. The time limit only
 * matters if one of those requests is lost.
 */
import type { ApiPublicPage } from '@/lib/api';
import { serverApiUrl } from '@/lib/server-api';

export const publicPageRevalidateSeconds = 60;

export function publicPageTag(slug: string): string {
  return `public-page:${slug}`;
}

/** The published copy, or null when there is no published page with this slug. */
export async function getPublicPage(slug: string): Promise<ApiPublicPage | null> {
  const res = await fetch(`${serverApiUrl()}/public/pages/${encodeURIComponent(slug)}/`, {
    next: { revalidate: publicPageRevalidateSeconds, tags: [publicPageTag(slug)] },
  });
  if (res.status === 404) return null;
  // Anything else is a server problem, not a missing page: show an error, not a 404
  if (!res.ok) throw new Error(`Public page request failed with status ${res.status}`);
  return res.json();
}

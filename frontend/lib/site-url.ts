/** Public URL of the frontend (NEXT_PUBLIC_SITE_URL), without a trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** The host part of the site URL, e.g. "paxl.app" */
export function siteHost(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return SITE_URL;
  }
}

/** Where a published page lives, as shown on its card: "paxl.app/p/my-page" (the real address, not an invented one). */
export function publicPageAddress(slug: string): string {
  return `${siteHost()}/p/${slug}`;
}

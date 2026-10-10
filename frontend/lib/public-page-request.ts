/**
 * How the root layout learns that a request is for a published page: the
 * proxy copies the slug of `/p/<slug>` (or of the page a custom domain points
 * to) into a request header. The layout then reads the page's language for
 * `<html lang>` (QA-091), since layouts are not told the path.
 *
 * The proxy always removes a header of that name sent by the browser, so the
 * value is only ever the proxy's. At worst it would only change `lang`.
 */
export const PUBLIC_SLUG_HEADER = 'x-paxl-public-slug';

const PUBLIC_PAGE_PATH = /^\/p\/([-a-zA-Z0-9_]{1,200})\/?$/;

/** The slug of a published-page path ("/p/mi-landing" -> "mi-landing"), or null. */
export function publicSlugFromPath(pathname: string): string | null {
  return PUBLIC_PAGE_PATH.exec(pathname)?.[1] ?? null;
}

/** Request headers with the public slug set to `slug` (or removed when null). */
export function withPublicSlug(headers: Headers, slug: string | null): Headers {
  const next = new Headers(headers);
  next.delete(PUBLIC_SLUG_HEADER);
  if (slug) next.set(PUBLIC_SLUG_HEADER, slug);
  return next;
}

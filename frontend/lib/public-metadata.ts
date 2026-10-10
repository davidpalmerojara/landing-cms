/**
 * The <head> of a published page: title, description, robots, Open Graph and
 * Twitter tags, from the frozen copy the API serves (ADR-017).
 */
import type { Metadata } from 'next';
import type { ApiPublicPage } from '@/lib/api';

/** The Open Graph types the server accepts (pages/models.py OG_TYPE_CHOICES). */
export const OG_TYPES = ['website', 'article'] as const;
export type OgType = (typeof OG_TYPES)[number];

/**
 * Any other stored value (old pages had "product") becomes "website": Next's
 * metadata throws on an unknown type, which turned the page into a 500 (QA-009).
 */
export function ogTypeOf(value: unknown): OgType {
  return OG_TYPES.find((type) => type === value) ?? 'website';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Description when the page has no SEO description: the hero's subtitle or
 * title, and when those are empty too, "<name> - Made with Paxl" (QA-118).
 */
export function fallbackDescription(page: Pick<ApiPublicPage, 'name' | 'blocks'>, madeWith: string): string {
  const hero = page.blocks.find((block) => block.type === 'hero');
  return text(hero?.data.subtitle) || text(hero?.data.title) || `${page.name} - ${madeWith}`;
}

export function publicPageMetadata(page: ApiPublicPage, madeWith: string): Metadata {
  const fallbackDesc = fallbackDescription(page, madeWith);
  const title = page.seo_title || page.name;
  const description = page.seo_description || fallbackDesc;
  const canonicalUrl = page.seo_canonical_url || undefined;
  const ogTitle = page.og_title || page.seo_title || page.name;
  const ogDescription = page.og_description || page.seo_description || fallbackDesc;
  const ogImage = page.og_image || undefined;

  return {
    title,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    ...(page.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: ogTypeOf(page.og_type),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

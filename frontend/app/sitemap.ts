import type { MetadataRoute } from 'next';
import { serverApiUrl } from '@/lib/server-api';
import { SITE_URL } from '@/lib/site-url';

const API_BASE = serverApiUrl();

interface SitemapPage {
  slug: string;
  updated_at: string;
  seo_canonical_url?: string;
  noindex?: boolean;
}

// The public pages of the product itself (the published pages of its users come from the backend)
const STATIC_ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: '', priority: 1 },
  { path: '/pricing', priority: 0.7 },
  { path: '/about', priority: 0.5 },
  { path: '/contact', priority: 0.4 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
  { path: '/changelog', priority: 0.3 },
];

function staticEntries(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${API_BASE}/public/sitemap-data/`, { cache: 'no-store' });
    if (res.ok) {
      const pages: SitemapPage[] = await res.json();
      const published = pages
        .filter((p) => !p.noindex)
        .map((p) => ({
          url: p.seo_canonical_url || `${SITE_URL}/p/${p.slug}`,
          lastModified: new Date(p.updated_at),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
      return [...staticEntries(), ...published];
    }
  } catch (error) {
    // The backend may be starting up: the product's own pages are still worth listing
    if (process.env.NODE_ENV === 'development') console.error('Sitemap data unavailable:', error);
  }

  return staticEntries();
}

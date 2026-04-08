import type { MetadataRoute } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://paxl.app';

interface SitemapPage {
  slug: string;
  updated_at: string;
  seo_canonical_url?: string;
  noindex?: boolean;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch published pages from backend
  try {
    const res = await fetch(`${API_BASE}/sitemap/`, { cache: 'no-store' });
    if (!res.ok) return fallbackSitemap();

    // The backend returns XML, but we can also just query the pages API
    // For simplicity, use the public endpoint approach
  } catch {
    // ignore
  }

  // Use pages list approach — fetch published pages
  try {
    const res = await fetch(`${API_BASE}/public/sitemap-data/`, { cache: 'no-store' });
    if (res.ok) {
      const pages: SitemapPage[] = await res.json();
      return pages
        .filter((p) => !p.noindex)
        .map((p) => ({
          url: p.seo_canonical_url || `${SITE_URL}/p/${p.slug}`,
          lastModified: new Date(p.updated_at),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
    }
  } catch {
    // ignore
  }

  return fallbackSitemap();
}

function fallbackSitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}

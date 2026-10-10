import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Built from NEXT_PUBLIC_SITE_URL so the sitemap address is the real host of each deployment (it was a fixed one)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/editor', '/settings', '/preview', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { LOCALE_COOKIE, MESSAGES, resolveLocale } from '@/lib/i18n';
import PublicPageClient from './PublicPageClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

interface ApiBlock {
  id: string;
  type: string;
  order: number;
  data: Record<string, unknown>;
  styles: Record<string, unknown>;
}

interface ApiPage {
  id: string;
  name: string;
  slug: string;
  status: string;
  theme_id?: string;
  custom_theme?: Record<string, string> | null;
  seo_title?: string;
  seo_description?: string;
  seo_canonical_url?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  og_type?: string;
  noindex?: boolean;
  blocks: ApiBlock[];
}

async function getPublicPage(slug: string): Promise<ApiPage | null> {
  try {
    const res = await fetch(`${API_BASE}/public/pages/${slug}/`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );
  if (!page) {
    return { title: MESSAGES[locale].errors.notFoundTitle };
  }

  // Fallback description from hero block
  const heroBlock = page.blocks.find((b) => b.type === 'hero');
  const fallbackDesc = heroBlock
    ? String(heroBlock.data.subtitle || heroBlock.data.title || '')
    : `${page.name} - ${MESSAGES[locale].publicPage.madeWith}`;

  const title = page.seo_title || page.name;
  const description = page.seo_description || fallbackDesc;
  const canonicalUrl = page.seo_canonical_url || undefined;
  const ogTitle = page.og_title || page.seo_title || page.name;
  const ogDescription = page.og_description || page.seo_description || fallbackDesc;
  const ogImage = page.og_image || undefined;
  const ogType = (page.og_type || 'website') as 'website' | 'article';

  return {
    title,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    ...(page.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: ogType,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' as const : 'summary' as const,
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);

  if (!page) {
    notFound();
  }

  return <PublicPageClient page={page} />;
}

import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { LOCALE_COOKIE, MESSAGES, resolveLocale } from '@/lib/i18n';
import { getPublicPage } from '@/lib/public-page';
import { publicPageMetadata } from '@/lib/public-metadata';
import { pageMessagesLocale } from '@/lib/page-language';
import PublicPageClient from './PublicPageClient';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);
  const cookieStore = await cookies();
  const headerStore = await headers();
  const visitorLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );
  if (!page) {
    return { title: MESSAGES[visitorLocale].errors.notFoundTitle };
  }
  // The description is part of the page: in its language when Paxl has words for it
  const locale = pageMessagesLocale(page.language) ?? visitorLocale;
  return publicPageMetadata(page, MESSAGES[locale].publicPage.madeWith);
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicPage(slug);

  if (!page) {
    notFound();
  }

  return <PublicPageClient page={page} />;
}

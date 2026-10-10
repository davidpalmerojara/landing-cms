'use client';

import Script from 'next/script';
import { useLocale, useTranslations } from 'next-intl';
import type { ApiPublicPage } from '@/lib/api';
import { apiToTokens } from '@/lib/design-tokens';
import { apiBlocksToLocal } from '@/lib/page-mapping';
import { pageLanguage } from '@/lib/page-language';
import { pageThemeVars } from '@/lib/page-theme';
import PageRenderer from '@/components/renderer/PageRenderer';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

/**
 * The published page. It is rendered on the server as well, so the full
 * content is in the HTML: nothing here may depend on the window.
 *
 * Paxl's own notices (guest page, watermark) are in the visitor's language and
 * outside the page's themed area, painted above it (QA-005).
 */
export default function PublicPageClient({ page }: { page: ApiPublicPage }) {
  const t = useTranslations();
  // <html lang> is the page's language; Paxl's own words are the visitor's, so they say so (PUBLIC2-006)
  const locale = useLocale();
  const blocks = apiBlocksToLocal(page.blocks);
  const themeVars = pageThemeVars(apiToTokens(page.design_tokens));

  if (blocks.length === 0) {
    // Paxl's screen, not the page's: fixed light colors whatever the visitor's system theme (QA-092)
    return (
      <main id="main-content" lang={locale} tabIndex={-1} className="flex items-center justify-center h-screen bg-white text-[#4B5563] outline-none">
        <p className="text-xl">{t('publicPage.empty')}</p>
      </main>
    );
  }

  return (
    <>
      {page.is_guest_page && (
        <aside lang={locale} aria-label={t('publicPage.noticeLabel')} className="relative z-10">
          <p role="note" className="m-0 px-4 py-2.5 text-center text-sm font-medium bg-amber-100 text-amber-900 border-b border-amber-300">
            {t('publicPage.guestNotice')}
          </p>
        </aside>
      )}
      <PageRenderer
        blocks={blocks}
        themeVars={themeVars}
        language={pageLanguage(page.language)}
        liveLinks
        contactSlug={page.is_guest_page ? undefined : page.slug}
        guestPage={page.is_guest_page}
        // Room at the end so the watermark never covers the last lines on a phone (QA-124)
        className={page.show_watermark ? 'pb-16' : undefined}
      />
      <Script
        src="/bp-analytics.js"
        strategy="afterInteractive"
        data-page-id={page.id}
        data-api-url={API_BASE}
      />

      {page.show_watermark && (
        <aside lang={locale} aria-label={t('common.brand')} className="fixed bottom-4 right-4 z-50">
          <a
            href="/"
            target="_blank"
            className="flex items-center gap-1.5 min-h-11 bg-white/95 backdrop-blur-sm text-[#374151] hover:text-[#1D4ED8] text-xs px-4 rounded-full shadow-lg border border-[#E5E7EB] transition-colors"
          >
            <svg aria-hidden="true" className="w-3 h-3" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 5h5l-4 3 2 5-5-4-5 4 2-5-4-3h5z" fill="currentColor"/></svg>
            {t('publicPage.madeWith')}
          </a>
        </aside>
      )}
    </>
  );
}

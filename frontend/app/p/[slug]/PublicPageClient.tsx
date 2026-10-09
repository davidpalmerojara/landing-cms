'use client';

import Script from 'next/script';
import { useTranslations } from 'next-intl';
import type { ApiPublicPage } from '@/lib/api';
import { apiToTokens } from '@/lib/design-tokens';
import { apiBlocksToLocal } from '@/lib/page-mapping';
import { pageThemeVars } from '@/lib/page-theme';
import type { ThemeColors } from '@/lib/themes';
import PageRenderer from '@/components/renderer/PageRenderer';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

/**
 * The published page. It is rendered on the server as well, so the full
 * content is in the HTML: nothing here may depend on the window.
 */
export default function PublicPageClient({ page }: { page: ApiPublicPage }) {
  const t = useTranslations();
  const blocks = apiBlocksToLocal(page.blocks);
  // Convert first: the API sends {} for "no tokens", which is truthy.
  const themeVars = pageThemeVars({
    themeId: page.theme_id,
    customTheme: page.custom_theme as ThemeColors | undefined,
    designTokens: apiToTokens(page.design_tokens as Record<string, unknown> | undefined),
  });

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-white text-muted">
        <p className="text-xl">{t('publicPage.empty')}</p>
      </div>
    );
  }

  return (
    <PageRenderer blocks={blocks} themeVars={themeVars} liveLinks contactSlug={page.slug}>
      <Script
        src="/bp-analytics.js"
        strategy="afterInteractive"
        data-page-id={page.id}
        data-api-url={API_BASE}
      />

      {page.show_watermark && (
        <div className="fixed bottom-4 right-4 z-50">
          <a
            href="/"
            target="_blank"
            className="flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-sm text-muted hover:text-primary text-xs px-3 py-1.5 rounded-full shadow-lg border border-subtle/50 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 5h5l-4 3 2 5-5-4-5 4 2-5-4-3h5z" fill="currentColor"/></svg>
            {t('publicPage.madeWith')}
          </a>
        </div>
      )}
    </PageRenderer>
  );
}

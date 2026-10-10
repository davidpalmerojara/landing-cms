'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Paxl's 404 for a published-page address. It is seen by anyone, logged in or
 * not, so it only offers the home page. Fixed light colors, not the app's
 * theme tokens: those follow the visitor's system theme and turned this white
 * screen into grey-on-white with a dark OS (QA-092).
 */
export default function PublicPageNotFound() {
  const t = useTranslations();

  return (
    <main id="main-content" tabIndex={-1} className="flex items-center justify-center min-h-screen px-4 bg-white text-[#111827] outline-none">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-2 text-[#1D4ED8]">
          <Sparkles className="w-6 h-6" aria-hidden="true" />
          <span className="text-lg font-semibold">{t('common.brand')}</span>
        </div>

        <div className="space-y-2">
          <p className="text-6xl font-bold text-[#4B5563]">404</p>
          <h1 className="text-xl font-semibold">{t('errors.publicNotFoundTitle')}</h1>
          <p className="text-sm text-[#4B5563]">
            {t('errors.publicNotFoundDescription')}
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center min-h-11 px-2 text-sm font-medium text-[#1D4ED8] hover:underline"
          >
            {t('errors.goHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}

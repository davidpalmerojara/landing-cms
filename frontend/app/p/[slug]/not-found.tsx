'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PublicPageNotFound() {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-center h-screen bg-white text-[#111827]">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-2 text-[#2563EB]">
          <Sparkles className="w-6 h-6" />
          <span className="text-lg font-semibold">{t('common.brand')}</span>
        </div>

        <div className="space-y-2">
          <p className="text-6xl font-bold text-secondary">404</p>
          <p className="text-xl font-semibold">{t('errors.publicNotFoundTitle')}</p>
          <p className="text-sm text-muted">
            {t('errors.publicNotFoundDescription')}
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            href="/"
            className="text-sm text-muted hover:text-[#111827] transition-colors"
          >
            {t('errors.goHome')}
          </Link>
          <span className="text-secondary">|</span>
          <Link
            href="/dashboard"
            className="text-sm text-primary-color hover:text-[#2563EB]/80 transition-colors"
          >
            {t('errors.goDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}

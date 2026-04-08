'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface text-secondary px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <p className="text-6xl md:text-8xl font-extrabold text-surface-card mb-4">404</p>

        <h1 className="text-2xl font-bold text-primary mb-2">{t('notFoundTitle')}</h1>
        <p className="text-sm text-muted mb-8">
          {t('notFoundDescription')}
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-lg shadow-[#2563EB]/20 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {t('goHome')}
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-secondary hover:text-primary px-5 py-2.5 rounded-lg border border-subtle hover:border-default transition-colors"
          >
            {t('goDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}

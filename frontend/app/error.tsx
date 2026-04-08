'use client';

import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface text-secondary px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>

        <h1 className="text-2xl font-bold text-primary mb-2">{t('errors.globalTitle')}</h1>
        <p className="text-sm text-muted mb-8">
          {t('errors.globalDescription')}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-lg shadow-[#2563EB]/20 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {t('common.retry')}
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-secondary hover:text-primary px-5 py-2.5 rounded-lg border border-subtle hover:border-default transition-colors"
          >
            {t('errors.goDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}

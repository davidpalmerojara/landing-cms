'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Shown while the analytics code (charts included) downloads. */
export default function AnalyticsPanelLoading() {
  const t = useTranslations('analytics');

  return (
    <div role="status" aria-live="polite" className="flex h-full items-center justify-center gap-3 text-secondary">
      <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
      <span className="text-sm">{t('loadingPanel')}</span>
    </div>
  );
}

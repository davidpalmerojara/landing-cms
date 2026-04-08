'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('common');

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
        <span className="text-sm">{t('loading')}</span>
      </div>
    </div>
  );
}

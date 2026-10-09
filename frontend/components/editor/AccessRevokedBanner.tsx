'use client';

import { ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

/** Shown when the owner stops sharing the page while this person is editing it. */
const AccessRevokedBanner = () => {
  const t = useTranslations();
  const status = useEditorStore((s) => s.collabStatus);

  if (status !== 'revoked') return null;

  return (
    <div
      role="alert"
      className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-error/10 border-b border-error/30 text-sm"
    >
      <p className="flex items-start gap-2 text-primary">
        <ShieldOff className="w-4 h-4 mt-0.5 shrink-0 text-error" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{t('collab.revokedTitle')}</strong>{' '}
          <span className="text-secondary">{t('collab.revokedBody')}</span>
        </span>
      </p>
      <a
        href="/dashboard"
        className="min-h-11 px-4 rounded-full bg-primary hover:bg-primary-dark text-white text-xs font-bold flex items-center transition-all active:scale-95"
      >
        {t('editor.goToDashboard')}
      </a>
    </div>
  );
};

export default AccessRevokedBanner;

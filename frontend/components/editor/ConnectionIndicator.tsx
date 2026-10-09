'use client';

import { Loader2, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

/** Small top-bar notice while the collaboration socket is reconnecting or gave up. */
const ConnectionIndicator = () => {
  const t = useTranslations();
  const status = useEditorStore((s) => s.collabStatus);

  return (
    <span role="status" aria-live="polite">
      {status === 'reconnecting' && (
        <span className="flex items-center gap-1 text-warning text-[10px]">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          {t('collab.reconnecting')}
        </span>
      )}
      {status === 'offline' && (
        <span className="flex items-center gap-1 text-warning text-[10px]" title={t('collab.offlineHint')}>
          <WifiOff className="w-3 h-3" aria-hidden="true" />
          {t('collab.offline')}
          <span className="sr-only">{t('collab.offlineHint')}</span>
        </span>
      )}
    </span>
  );
};

export default ConnectionIndicator;

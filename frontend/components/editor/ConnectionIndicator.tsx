'use client';

import { Loader2, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

const OFFLINE_HINT_ID = 'collab-offline-hint';

/**
 * Small top-bar notice while the collaboration socket is reconnecting or gave
 * up. Offline shows a short label and a button to try again now; the longer
 * explanation is the button's description and the label's tooltip (QA-035).
 */
const ConnectionIndicator = () => {
  const t = useTranslations();
  const status = useEditorStore((s) => s.collabStatus);
  const requestReconnect = useEditorStore((s) => s.requestCollabReconnect);

  return (
    <span role="status" aria-live="polite" className="flex items-center">
      {status === 'reconnecting' && (
        <span className="flex items-center gap-1 text-warning text-xs whitespace-nowrap">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          {t('collab.reconnecting')}
        </span>
      )}
      {status === 'offline' && (
        <span className="flex items-center gap-1.5 text-warning text-xs whitespace-nowrap">
          <WifiOff className="w-3 h-3" aria-hidden="true" />
          <span title={t('collab.offlineHint')}>{t('collab.offline')}</span>
          <span id={OFFLINE_HINT_ID} className="sr-only">{t('collab.offlineHint')}</span>
          <button
            type="button"
            onClick={requestReconnect}
            aria-describedby={OFFLINE_HINT_ID}
            className="min-h-6 min-w-6 px-2 rounded-md border border-warning/30 text-warning hover:bg-warning/10 transition-colors"
          >
            {t('collab.reconnect')}
          </button>
        </span>
      )}
    </span>
  );
};

export default ConnectionIndicator;

'use client';

import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

const OFFLINE_HINT_ID = 'collab-offline-hint';

/**
 * Small top-bar notice while the collaboration socket is reconnecting or gave
 * up. Offline shows a short label and a button to try again now; the longer
 * explanation is the button's description and the label's tooltip (QA-035).
 * Below 2xl the labels are icons with a tooltip (the words stay for screen
 * readers), so the notice fits next to the page name (COLLAB2-002).
 */
const ConnectionIndicator = () => {
  const t = useTranslations();
  const status = useEditorStore((s) => s.collabStatus);
  const requestReconnect = useEditorStore((s) => s.requestCollabReconnect);

  return (
    <span role="status" aria-live="polite" className="flex items-center">
      {status === 'reconnecting' && (
        <span className="flex items-center gap-1 text-warning text-xs whitespace-nowrap" title={t('collab.reconnecting')}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only 2xl:not-sr-only">{t('collab.reconnecting')}</span>
        </span>
      )}
      {status === 'offline' && (
        <span className="flex items-center gap-1.5 text-warning text-xs whitespace-nowrap">
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span title={t('collab.offlineHint')} className="sr-only 2xl:not-sr-only">{t('collab.offline')}</span>
          <span id={OFFLINE_HINT_ID} className="sr-only">{t('collab.offlineHint')}</span>
          <button
            type="button"
            onClick={requestReconnect}
            aria-describedby={OFFLINE_HINT_ID}
            title={`${t('collab.offline')}. ${t('collab.offlineHint')}`}
            className="flex items-center justify-center gap-1 min-h-6 min-w-6 pointer-coarse:min-h-11 pointer-coarse:min-w-11 px-1.5 2xl:px-2 rounded-md border border-warning/30 text-warning hover:bg-warning/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 2xl:hidden" aria-hidden="true" />
            <span className="sr-only 2xl:not-sr-only">{t('collab.reconnect')}</span>
          </button>
        </span>
      )}
    </span>
  );
};

export default ConnectionIndicator;

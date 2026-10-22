'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSlowRequest } from '@/hooks/useSlowRequest';

interface WakingServerNoticeProps {
  /** A request is waiting for the server */
  pending: boolean;
  className?: string;
}

/**
 * "Waking up the server…" after a few seconds of waiting. The region is always
 * in the page, so a screen reader announces the text when it appears.
 */
export default function WakingServerNotice({ pending, className }: WakingServerNoticeProps) {
  const t = useTranslations('wakeUp');
  const slow = useSlowRequest(pending);

  return (
    <div role="status" className={className}>
      {slow && (
        <p className="flex items-start gap-2 text-xs text-secondary leading-relaxed">
          <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-primary">{t('title')}</strong>{' '}
            {t('description')}
          </span>
        </p>
      )}
    </div>
  );
}

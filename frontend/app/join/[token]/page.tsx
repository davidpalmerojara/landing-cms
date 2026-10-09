'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useJoinInvite } from '@/hooks/useJoinInvite';
import type { JoinError } from '@/hooks/useJoinInvite';

const errorText: Record<JoinError, { title: string; body: string }> = {
  invalid: { title: 'join.invalidTitle', body: 'join.invalidBody' },
  throttled: { title: 'join.throttledTitle', body: 'join.throttledBody' },
  capacity: { title: 'join.capacityTitle', body: 'join.capacityBody' },
  generic: { title: 'join.errorTitle', body: 'join.errorBody' },
};

/** Invite link ("ábrelo en incógnito"): joins the page and opens the editor. */
export default function JoinPage() {
  const t = useTranslations();
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';
  const { state, retry } = useJoinInvite(token);

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-black tracking-tighter mb-8" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {t('common.brand')}
        </h1>

        {state.status === 'joining' ? (
          <div role="status" className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary-color animate-spin" aria-hidden="true" />
            <p className="text-secondary">{t('join.joining')}</p>
          </div>
        ) : (
          <div role="alert" className="flex flex-col items-center gap-4">
            <AlertCircle className="w-8 h-8 text-error" aria-hidden="true" />
            <h2 className="text-lg font-bold text-primary">{t(errorText[state.error].title)}</h2>
            <p className="text-sm text-secondary">{t(errorText[state.error].body)}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {state.error !== 'invalid' && (
                <button
                  type="button"
                  onClick={retry}
                  className="min-h-11 px-5 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-bold transition-all active:scale-95"
                >
                  {t('join.retry')}
                </button>
              )}
              <Link
                href="/"
                className="min-h-11 px-5 rounded-full border border-default text-sm font-medium text-secondary hover:text-primary flex items-center transition-colors"
              >
                {t('join.goHome')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

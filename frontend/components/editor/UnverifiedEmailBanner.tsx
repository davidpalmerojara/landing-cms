'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Loader2, MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useFeatures } from '@/hooks/useFeatures';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';
import type { ApiUser } from '@/lib/api';

interface UnverifiedEmailBannerProps {
  user: ApiUser | null;
  className?: string;
  /** One short line for a phone (Quick Edit) */
  compact?: boolean;
}

/**
 * Accounts whose email is not verified publish like a guest: no indexing, no
 * Custom HTML, no contact form, and a notice on the page (ADR-052). This tells
 * the owner, with the way out: a sign-in link sent to the account's address.
 * Opening it also turns off a password that was never confirmed (ADR-018),
 * so the notice says so before the link is requested.
 */
export default function UnverifiedEmailBanner({ user, className, compact = false }: UnverifiedEmailBannerProps) {
  const t = useTranslations('verifyEmail');
  const { features } = useFeatures();
  const { state, send } = useVerifyEmail(user?.email ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Guests have their own banner; accounts from older servers do not say (undefined)
  if (!user || user.is_guest || user.email_verified !== false) return null;

  const canSend = features?.email !== false;
  const isSending = state.status === 'sending';

  return (
    <div
      role="region"
      aria-label={t('label')}
      className={clsx(
        'shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-warning/30 bg-warning/10 text-primary',
        compact ? 'pl-4 pr-2 text-[13px]' : 'px-4 py-2 text-sm',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex items-start gap-2">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{compact ? t('short') : t('text')}</span>
        </p>
        {state.status === 'sent' && (
          <p role="status" className={clsx('text-secondary', compact ? 'text-xs' : 'pl-6 text-xs')}>
            {t('sent', { email: user.email })}
          </p>
        )}
        {state.status === 'failed' && (
          <p role="alert" className={clsx('text-error', compact ? 'text-xs' : 'pl-6 text-xs')}>{state.message}</p>
        )}
        {!canSend && <p className={clsx('text-secondary', compact ? 'text-xs' : 'pl-6 text-xs')}>{t('emailOff')}</p>}
      </div>
      {canSend && state.status !== 'sent' && (
        <button
          type="button"
          // An account with a password is told first what verifying does to it (ADR-018)
          onClick={() => (user.has_password ? setConfirmOpen(true) : void send())}
          disabled={isSending}
          aria-busy={isSending}
          className={clsx(
            'min-h-11 shrink-0 rounded-full px-4 text-xs font-bold transition-all active:scale-95 disabled:opacity-60',
            compact ? 'text-primary-color' : 'bg-primary text-white hover:bg-primary-dark',
          )}
        >
          {isSending && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {state.status === 'failed' ? t('retry') : t('action')}
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={t('confirmTitle')}
        message={t('passwordWarning')}
        confirmLabel={t('confirmSend')}
        variant="default"
        onConfirm={() => { setConfirmOpen(false); void send(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

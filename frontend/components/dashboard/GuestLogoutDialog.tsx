'use client';

import { useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface GuestLogoutDialogProps {
  /** Keep the work: opens the dialog that turns the guest into an account */
  onCreateAccount: () => void;
  /** Leave anyway and lose the pages */
  onLogout: () => void;
  onCancel: () => void;
}

/** Logging out of a guest session deletes the work, so it asks first and offers to keep it (QA-061). */
export default function GuestLogoutDialog({ onCreateAccount, onLogout, onCancel }: GuestLogoutDialogProps) {
  const t = useTranslations();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, true, onCancel);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="relative w-full max-w-sm rounded-2xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/40"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
          </div>
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-primary">{t('guest.logoutTitle')}</h2>
            <p id={`${id}-description`} className="mt-1 text-sm leading-relaxed text-secondary">{t('guest.logoutBody')}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCreateAccount}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-white transition-all hover:bg-primary-dark active:scale-95"
          >
            {t('guest.claimAction')}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-error transition-colors hover:bg-error/10"
          >
            {t('guest.logoutAnyway')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-secondary transition-colors hover:bg-surface-card hover:text-primary"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

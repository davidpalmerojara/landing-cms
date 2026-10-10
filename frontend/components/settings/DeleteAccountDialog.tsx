'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ApiUser } from '@/lib/api';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import type { DeleteAccountError } from '@/hooks/useDeleteAccount';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface DeleteAccountDialogProps {
  user: ApiUser;
  onCancel: () => void;
}

const MESSAGE_KEYS: Record<DeleteAccountError, string> = {
  invalidPassword: 'settingsPage.deleteAccount.invalidPassword',
  usernameMismatch: 'settingsPage.deleteAccount.usernameMismatch',
  activeSubscription: 'settingsPage.deleteAccount.activeSubscription',
  tooManyAttempts: 'settingsPage.deleteAccount.tooManyAttempts',
  generic: 'settingsPage.deleteAccount.error',
};

const INPUT_CLASSES =
  'w-full min-h-11 bg-surface-elevated/80 border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-error focus:ring-1 focus:ring-error outline-none transition-colors';

/** Asks for the password (or the username) before the account and everything in it is deleted for good. */
export default function DeleteAccountDialog({ user, onCancel }: DeleteAccountDialogProps) {
  const t = useTranslations();
  const idPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const { confirmationKind, isDeleting, error, clearError, deleteAccount } = useDeleteAccount(user);

  const close = () => {
    if (!isDeleting) onCancel();
  };
  useDialogFocus(dialogRef, true, close);

  const isPassword = confirmationKind === 'password';
  const inputId = `${idPrefix}-confirmation`;
  const errorId = `${idPrefix}-error`;
  const canSubmit = confirmation.trim() !== '' && !isDeleting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // A password is sent as typed; the username may carry stray spaces from a paste
    void deleteAccount(isPassword ? confirmation : confirmation.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        aria-describedby={`${idPrefix}-description`}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface border border-subtle rounded-2xl shadow-2xl shadow-black/40 p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-error" aria-hidden="true" />
          </div>
          <div>
            <h2 id={`${idPrefix}-title`} className="text-lg font-semibold text-primary">
              {t('settingsPage.deleteAccount.dialogTitle')}
            </h2>
            <p id={`${idPrefix}-description`} className="text-sm text-secondary mt-1 leading-relaxed">
              {t('settingsPage.deleteAccount.dialogBody')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor={inputId} className="block text-xs font-medium text-secondary mb-1.5">
              {isPassword
                ? t('settingsPage.deleteAccount.passwordLabel')
                : t('settingsPage.deleteAccount.usernameLabel', { username: user.username })}
            </label>
            <input
              id={inputId}
              type={isPassword ? 'password' : 'text'}
              autoComplete={isPassword ? 'current-password' : 'off'}
              autoCapitalize="none"
              spellCheck={false}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                if (error) clearError();
              }}
              aria-required="true"
              aria-invalid={error === 'invalidPassword' || error === 'usernameMismatch' ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              disabled={isDeleting}
              className={`${INPUT_CLASSES} ${error ? 'border-error' : 'border-subtle'}`}
            />
          </div>

          {error && (
            <div id={errorId} role="alert" className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p>{t(MESSAGE_KEYS[error])}</p>
                {error === 'activeSubscription' && (
                  <Link href="/settings/billing" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
                    {t('settingsPage.deleteAccount.goToBilling')}
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={isDeleting}
              className="min-h-11 px-4 rounded-lg text-sm font-medium text-secondary hover:text-primary hover:bg-surface-card transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={isDeleting}
              className="min-h-11 px-5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {isDeleting ? t('settingsPage.deleteAccount.deleting') : t('settingsPage.deleteAccount.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import type { ApiUser } from '@/lib/api';
import { validateSignUp } from '@/lib/auth-validation';
import type { SignUpField, SignUpValues } from '@/lib/auth-validation';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';

interface ClaimGuestDialogProps {
  /** Closes the dialog without claiming */
  onCancel: () => void;
  /** The account was created: called with the new (non-guest) user once the person continues */
  onClaimed: (user: ApiUser) => void;
}

const FIELDS: ReadonlyArray<{
  name: SignUpField;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  labelKey: 'auth.username' | 'auth.email' | 'auth.password' | 'auth.confirmPassword';
}> = [
  { name: 'username', type: 'text', autoComplete: 'username', labelKey: 'auth.username' },
  { name: 'email', type: 'email', autoComplete: 'email', labelKey: 'auth.email' },
  { name: 'password', type: 'password', autoComplete: 'new-password', labelKey: 'auth.password' },
  { name: 'password2', type: 'password', autoComplete: 'new-password', labelKey: 'auth.confirmPassword' },
];

const INPUT_CLASSES =
  'w-full min-h-11 bg-surface-elevated/80 border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors';

export default function ClaimGuestDialog({ onCancel, onClaimed }: ClaimGuestDialogProps) {
  const t = useTranslations();
  const idPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [values, setValues] = useState<SignUpValues>({ username: '', email: '', password: '', password2: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignUpField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [claimedUser, setClaimedUser] = useState<ApiUser | null>(null);

  const close = () => {
    if (claimedUser) onClaimed(claimedUser);
    else if (!isSubmitting) onCancel();
  };
  useDialogFocus(dialogRef, true, close);
  // On a phone the back button closes the dialog instead of leaving the editor and losing the form (MOBILE2-007)
  useCloseOnBack(true, close);

  // The form is replaced by the confirmation: keep the keyboard focus inside the dialog
  useEffect(() => {
    if (claimedUser) continueRef.current?.focus();
  }, [claimedUser]);

  const fieldId = (name: SignUpField) => `${idPrefix}-${name}`;

  const focusField = (name: SignUpField) => {
    document.getElementById(fieldId(name))?.focus();
  };

  const handleChange = (name: SignUpField, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    const problems = validateSignUp(values);
    const problemFields = FIELDS.map((f) => f.name).filter((name) => problems[name]);
    if (problemFields.length > 0) {
      const messages: Partial<Record<SignUpField, string>> = {};
      for (const name of problemFields) {
        const problem = problems[name];
        if (problem) messages[name] = t(`guest.claim.${problem}`);
      }
      setFieldErrors(messages);
      focusField(problemFields[0]);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const res = await api.auth.claimGuest({
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
        password2: values.password2,
      });
      setClaimedUser(res.user);
    } catch (err) {
      showServerError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showServerError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 400 && err.details) {
      const messages: Partial<Record<SignUpField, string>> = {};
      for (const { name } of FIELDS) {
        const first = err.details[name]?.[0];
        if (first) messages[name] = first;
      }
      if (Object.keys(messages).length > 0) {
        setFieldErrors(messages);
        const firstField = FIELDS.find((f) => messages[f.name]);
        if (firstField) focusField(firstField.name);
        return;
      }
    }
    if (err instanceof ApiError && (err.code === 'GUEST_EXPIRED' || err.status === 401)) {
      setFormError(t('guest.claim.expired'));
      return;
    }
    if (process.env.NODE_ENV === 'development') console.error('Claiming the guest account failed:', err);
    setFormError(t('guest.claim.error'));
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
        {claimedUser ? (
          <div role="status" className="flex flex-col items-center gap-3 text-center py-2">
            <CheckCircle className="w-10 h-10 text-success" aria-hidden="true" />
            <h2 id={`${idPrefix}-title`} className="text-lg font-semibold text-primary">{t('guest.claim.successTitle')}</h2>
            <p id={`${idPrefix}-description`} className="text-sm text-secondary leading-relaxed">{t('guest.claim.successBody')}</p>
            <button
              ref={continueRef}
              type="button"
              onClick={() => onClaimed(claimedUser)}
              className="mt-2 min-h-11 px-6 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-bold transition-all active:scale-95"
            >
              {t('guest.claim.continue')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 id={`${idPrefix}-title`} className="text-lg font-semibold text-primary">{t('guest.claim.title')}</h2>
                <p id={`${idPrefix}-description`} className="text-sm text-secondary mt-1 leading-relaxed">
                  {t('guest.claim.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t('common.close')}
                className="shrink-0 w-11 h-11 -mt-2 -mr-2 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-card transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {formError && (
                <div role="alert" className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              {FIELDS.map((field) => {
                const error = fieldErrors[field.name];
                return (
                  <div key={field.name}>
                    <label htmlFor={fieldId(field.name)} className="block text-xs font-medium text-secondary mb-1.5">
                      {t(field.labelKey)}
                    </label>
                    <input
                      id={fieldId(field.name)}
                      type={field.type}
                      autoComplete={field.autoComplete}
                      value={values[field.name]}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      aria-required="true"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${fieldId(field.name)}-error` : undefined}
                      className={`${INPUT_CLASSES} ${error ? 'border-error' : 'border-subtle'}`}
                    />
                    {error && (
                      <p id={`${fieldId(field.name)}-error`} className="mt-1.5 text-xs text-error">{error}</p>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSubmitting}
                  className="min-h-11 px-4 rounded-lg text-sm font-medium text-secondary hover:text-primary hover:bg-surface-card transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="min-h-11 px-5 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? t('guest.claim.submitting') : t('guest.claim.submit')}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import { accountErrorKey } from '@/lib/account-errors';
import { validateSignUp } from '@/lib/auth-validation';
import type { SignUpField, SignUpValues } from '@/lib/auth-validation';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthTextField from '@/components/auth/AuthTextField';
import GoogleSignIn, { GOOGLE_SIGN_IN_AVAILABLE } from '@/components/auth/GoogleSignIn';
import PasswordDisabledScreen from '@/components/auth/PasswordDisabledScreen';
import GuestStartButton from '@/components/guest/GuestStartButton';
import { useFocusOnMount } from '@/hooks/useFocusOnMount';

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

type FieldErrors = Partial<Record<SignUpField, string>>;

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState<SignUpValues>({ username: '', email: '', password: '', password2: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordDisabled, setPasswordDisabled] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  useFocusOnMount(usernameRef);

  const focusField = (name: SignUpField) => {
    document.getElementById(`register-${name}`)?.focus();
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

  const showServerError = (err: unknown) => {
    // Every field the server rejected is shown at once (QA-054), in the language of the request
    if (err instanceof ApiError && err.status === 400 && err.details) {
      const messages: FieldErrors = {};
      for (const { name } of FIELDS) {
        const first = err.details[name]?.[0];
        if (first) messages[name] = first;
      }
      const firstField = FIELDS.find((f) => messages[f.name]);
      if (firstField) {
        setFieldErrors(messages);
        focusField(firstField.name);
        return;
      }
    }
    setError(t(accountErrorKey(err) ?? 'auth.registerError'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    const problems = validateSignUp(values);
    const problemFields = FIELDS.map((f) => f.name).filter((name) => problems[name]);
    if (problemFields.length > 0) {
      const messages: FieldErrors = {};
      for (const name of problemFields) {
        const problem = problems[name];
        if (problem) messages[name] = t(`auth.${problem}`);
      }
      setFieldErrors(messages);
      focusField(problemFields[0]);
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    try {
      await api.auth.register({
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
        password2: values.password2,
      });
      router.replace('/dashboard');
    } catch (err) {
      showServerError(err);
      setIsLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError('');
    setIsLoading(true);
    try {
      const res = await api.auth.googleLogin(credential);
      if (res.password_disabled) setPasswordDisabled(true);
      else router.replace('/dashboard');
    } catch (err) {
      setError(t(accountErrorKey(err) ?? 'auth.googleRegisterError'));
      setIsLoading(false);
    }
  };

  if (passwordDisabled) {
    return <PasswordDisabledScreen onContinue={() => router.replace('/dashboard')} />;
  }

  return (
    <AuthLayout title={t('auth.register')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div role="alert">
          {error && (
            <div className="flex items-center gap-2 text-error text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>

        {FIELDS.map((field) => (
          <AuthTextField
            key={field.name}
            id={`register-${field.name}`}
            label={t(field.labelKey)}
            type={field.type}
            value={values[field.name]}
            onChange={(value) => handleChange(field.name, value)}
            autoComplete={field.autoComplete}
            error={fieldErrors[field.name]}
            inputRef={field.name === 'username' ? usernameRef : undefined}
          />
        ))}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full min-h-11 text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {t('auth.register')}
        </button>
      </form>

      {GOOGLE_SIGN_IN_AVAILABLE && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-subtle" />
            <span className="text-xs text-muted">{t('common.or')}</span>
            <div className="flex-1 h-px bg-subtle" />
          </div>

          <GoogleSignIn
            text="signup_with"
            onCredential={handleGoogle}
            onError={() => setError(t('auth.googleConnectError'))}
          />
        </>
      )}

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-subtle" />
        <span className="text-xs text-muted">{t('common.or')}</span>
        <div className="flex-1 h-px bg-subtle" />
      </div>

      <GuestStartButton variant="form" />

      <p className="text-center text-sm text-muted mt-6">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="text-primary-color underline underline-offset-2 hover:text-primary-color/80 transition-colors">
          {t('auth.loginLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}

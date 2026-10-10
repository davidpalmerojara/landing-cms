'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, Mail, CheckCircle, ArrowLeft, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import { accountErrorKey } from '@/lib/account-errors';
import { nextPathFromLocation } from '@/lib/safe-redirect';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthTextField from '@/components/auth/AuthTextField';
import GoogleSignIn, { GOOGLE_SIGN_IN_AVAILABLE } from '@/components/auth/GoogleSignIn';
import PasswordDisabledScreen from '@/components/auth/PasswordDisabledScreen';
import GuestStartButton from '@/components/guest/GuestStartButton';
import { useFocusOnMount } from '@/hooks/useFocusOnMount';
import { useGuestExpiredNotice } from '@/hooks/useGuestExpiredNotice';

type AuthMode = 'password' | 'magic';

const SUBMIT_STYLE = { background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' };

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [securedNextPath, setSecuredNextPath] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  // useAuth sends an expired guest here with ?guest=expired
  const guestExpired = useGuestExpiredNotice();
  useFocusOnMount(usernameRef);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.auth.login({ username: username.trim(), password });
      router.replace(nextPathFromLocation());
    } catch (err) {
      // Wrong credentials are a 401; a throttled, offline or broken server must not say "wrong password" (QA-055)
      const wrongCredentials = err instanceof ApiError && err.status === 401;
      setError(t(wrongCredentials ? 'auth.loginError' : accountErrorKey(err) ?? 'errors.server'));
      setIsLoading(false);
    }
  };

  const handleMagicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.auth.magicRequest(magicEmail.trim());
      setMagicSent(true);
    } catch (err) {
      setError(t(accountErrorKey(err) ?? 'auth.magicError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError('');
    setIsLoading(true);
    try {
      const res = await api.auth.googleLogin(credential);
      if (res.password_disabled) setSecuredNextPath(nextPathFromLocation());
      else router.replace(nextPathFromLocation());
    } catch (err) {
      setError(t(accountErrorKey(err) ?? 'auth.googleLoginError'));
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setMagicSent(false);
  };

  if (securedNextPath) {
    return <PasswordDisabledScreen onContinue={() => router.replace(securedNextPath)} />;
  }

  return (
    <AuthLayout title={t('auth.login')} subtitle={t('auth.loginSubtitle')}>
      {guestExpired && (
        <div role="status" className="flex items-start gap-2 text-secondary text-sm bg-surface-elevated border border-subtle rounded-lg px-4 py-3 mb-4">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary-color" aria-hidden="true" />
          <span>{t('guest.expiredNotice')}</span>
        </div>
      )}

      {/* The region exists before the message does, so screen readers announce it */}
      <div role="alert">
        {error && (
          <div className="flex items-center gap-2 text-error text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
      </div>

      {/* Password form */}
      {mode === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <AuthTextField
            id="login-username"
            label={t('auth.username')}
            type="text"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            inputRef={usernameRef}
          />
          <AuthTextField
            id="login-password"
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-11 text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            style={SUBMIT_STYLE}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t('auth.login')}
          </button>
        </form>
      )}

      {/* Magic link form */}
      {mode === 'magic' && !magicSent && (
        <form onSubmit={handleMagicSubmit} className="space-y-4">
          <AuthTextField
            id="login-magic-email"
            label={t('auth.email')}
            type="email"
            value={magicEmail}
            onChange={setMagicEmail}
            autoComplete="email"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-11 text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            style={SUBMIT_STYLE}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <Mail className="w-4 h-4" aria-hidden="true" />
            {t('auth.sendMagicLink')}
          </button>
        </form>
      )}

      {/* Magic link sent confirmation */}
      {mode === 'magic' && magicSent && (
        <div role="status" className="flex flex-col items-center gap-3 py-4">
          <CheckCircle className="w-8 h-8 text-success" aria-hidden="true" />
          <p className="text-primary font-medium text-center">{t('auth.magicLinkSentTitle')}</p>
          <p className="text-muted text-sm text-center">
            {t('auth.magicLinkSentDescription', { email: magicEmail.trim().toLowerCase() })}
          </p>
          <p className="text-muted text-xs text-center mt-1">
            {t('auth.magicLinkExpiry')}
          </p>
          <button
            type="button"
            onClick={() => { setMagicSent(false); setMagicEmail(''); }}
            className="min-h-11 text-primary-color hover:text-primary-color/80 transition-colors text-sm mt-2 flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            {t('auth.sendAnotherEmail')}
          </button>
        </div>
      )}

      {/* Toggle between password and magic link */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-subtle" />
        <span className="text-xs text-muted">{t('common.or')}</span>
        <div className="flex-1 h-px bg-subtle" />
      </div>

      {mode === 'password' ? (
        <button
          type="button"
          onClick={() => switchMode('magic')}
          className="w-full min-h-11 border border-subtle hover:border-default text-secondary hover:text-primary text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
          {t('auth.magicLinkLogin')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => switchMode('password')}
          className="w-full min-h-11 border border-subtle hover:border-default text-secondary hover:text-primary text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {t('auth.passwordLogin')}
        </button>
      )}

      {GOOGLE_SIGN_IN_AVAILABLE && (
        <>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-subtle" />
            <span className="text-xs text-muted">{t('common.or')}</span>
            <div className="flex-1 h-px bg-subtle" />
          </div>

          <GoogleSignIn
            text="continue_with"
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
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="text-primary-color hover:text-primary-color/80 transition-colors">
          {t('auth.registerLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}

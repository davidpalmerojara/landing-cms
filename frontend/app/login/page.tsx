'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { Loader2, AlertCircle, Mail, CheckCircle, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

const hasGoogle = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type AuthMode = 'password' | 'magic';

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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.auth.login({ username, password });
      router.replace('/dashboard');
    } catch {
      setError(t('auth.loginError'));
      setIsLoading(false);
    }
  };

  const handleMagicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.auth.magicRequest(magicEmail);
      setMagicSent(true);
    } catch {
      setError(t('auth.magicError'));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setMagicSent(false);
  };

  return (
    <div id="main-content" className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-[calc(100vw-32px)] sm:max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter mb-1" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('common.brand')}
          </h1>
          <p className="text-sm text-muted mt-1">{t('auth.loginSubtitle')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Password form */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full bg-surface-elevated\/80 border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-colors"
                placeholder={t('auth.username')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-surface-elevated\/80 border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('auth.login')}
            </button>
          </form>
        )}

        {/* Magic link form */}
        {mode === 'magic' && !magicSent && (
          <form onSubmit={handleMagicSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth.email')}</label>
              <input
                type="email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-surface-elevated\/80 border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-colors"
                placeholder={t('auth.email')}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Mail className="w-4 h-4" />
              {t('auth.sendMagicLink')}
            </button>
          </form>
        )}

        {/* Magic link sent confirmation */}
        {mode === 'magic' && magicSent && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <p className="text-primary font-medium text-center">{t('auth.magicLinkSentTitle')}</p>
            <p className="text-muted text-sm text-center">
              {t('auth.magicLinkSentDescription', { email: magicEmail })}
            </p>
            <p className="text-muted text-xs text-center mt-1">
              {t('auth.magicLinkExpiry')}
            </p>
            <button
              onClick={() => { setMagicSent(false); setMagicEmail(''); }}
              className="text-primary-color hover:text-[#2563EB]/80 transition-colors text-sm mt-2 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
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
            onClick={() => switchMode('magic')}
            className="w-full border border-subtle hover:border-default text-secondary hover:text-primary text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            {t('auth.magicLinkLogin')}
          </button>
        ) : (
          <button
            onClick={() => switchMode('password')}
            className="w-full border border-subtle hover:border-default text-secondary hover:text-primary text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('auth.passwordLogin')}
          </button>
        )}

        {hasGoogle && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-subtle" />
              <span className="text-xs text-muted">{t('common.or')}</span>
              <div className="flex-1 h-px bg-subtle" />
            </div>

            <div className="flex justify-center w-full [&>div]:w-full">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (!credentialResponse.credential) return;
                  setError('');
                  setIsLoading(true);
                  try {
                    await api.auth.googleLogin(credentialResponse.credential);
                    router.replace('/dashboard');
                  } catch {
                    setError(t('auth.googleLoginError'));
                    setIsLoading(false);
                  }
                }}
                onError={() => setError(t('auth.googleConnectError'))}
                theme="filled_black"
                size="large"
                text="continue_with"
              />
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted mt-6">
          {t('auth.noAccount')}{' '}
          <a href="/register" className="text-primary-color hover:text-[#2563EB]/80 transition-colors">
            {t('auth.registerLink')}
          </a>
        </p>
      </div>
    </div>
  );
}

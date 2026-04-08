'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

const hasGoogle = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== password2) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.register({ username, email, password, password2 });
      router.replace('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.registerParsingError');
      // Try to parse DRF validation errors
      try {
        const parsed = JSON.parse(msg.replace(/^API \d+: /, ''));
        const firstError = Object.values(parsed).flat()[0];
        setError(String(firstError));
      } catch {
        setError(t('auth.registerError'));
      }
      setIsLoading(false);
    }
  };

  return (
    <div id="main-content" className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter mb-1" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('common.brand')}
          </h1>
          <p className="text-sm text-muted mt-1">{t('auth.registerSubtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

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
            <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-elevated\/80 border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-colors"
              placeholder={t('auth.email')}
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

          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">{t('auth.confirmPassword')}</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
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
            {t('auth.register')}
          </button>
        </form>

        {hasGoogle && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-subtle" />
              <span className="text-xs text-muted">{t('common.or')}</span>
              <div className="flex-1 h-px bg-subtle" />
            </div>

            {/* Google Sign Up */}
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
                    setError(t('auth.googleRegisterError'));
                    setIsLoading(false);
                  }
                }}
                onError={() => setError(t('auth.googleConnectError'))}
                theme="filled_black"
                size="large"
                text="signup_with"
              />
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted mt-6">
          {t('auth.haveAccount')}{' '}
          <a href="/login" className="text-primary-color hover:text-[#2563EB]/80 transition-colors">
            {t('auth.loginLink')}
          </a>
        </p>
      </div>
    </div>
  );
}

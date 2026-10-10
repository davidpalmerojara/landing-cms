'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { accountErrorKey } from '@/lib/account-errors';
import PasswordDisabledScreen from '@/components/auth/PasswordDisabledScreen';

export default function MagicVerifyPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [passwordDisabled, setPasswordDisabled] = useState(false);

  useEffect(() => {
    if (!token) return;

    api.auth.magicVerify(token)
      .then((res) => {
        setVerifying(false);
        // The account's unconfirmed password was turned off: explain before moving on
        if (res.password_disabled) setPasswordDisabled(true);
        else setTimeout(() => router.replace('/dashboard'), 1500);
      })
      .catch((e: unknown) => {
        setVerifying(false);
        // An unusable link says so; a network blip, a throttle or a server fault must not tell
        // the person to throw away a link that may be fine (APP2-007)
        setError(t(accountErrorKey(e) ?? 'auth.magicLinkInvalid'));
      });
  }, [token, router, t]);

  if (passwordDisabled) {
    return <PasswordDisabledScreen onContinue={() => router.replace('/dashboard')} />;
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="sr-only">{t('auth.magicTitle')}</h1>
        <div className="flex flex-col items-center mb-8">
          <p className="text-2xl font-black tracking-tighter mb-1" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('common.brand')}
          </p>
        </div>

        {verifying && (
          <div role="status" className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary-color animate-spin" aria-hidden="true" />
            <p className="text-secondary">{t('auth.magicVerifying')}</p>
          </div>
        )}

        {!verifying && !error && (
          <div role="status" className="flex flex-col items-center gap-3">
            <CheckCircle className="w-8 h-8 text-success" aria-hidden="true" />
            <p className="text-primary font-medium">{t('auth.magicVerified')}</p>
            <p className="text-muted text-sm">{t('auth.magicRedirecting')}</p>
          </div>
        )}

        {!verifying && error && (
          <div className="flex flex-col items-center gap-4">
            <p role="alert" className="flex items-center gap-2 text-error text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
            <Link
              href="/login"
              className="inline-flex items-center min-h-11 text-primary-color hover:text-primary-color/80 transition-colors text-sm"
            >
              {t('auth.backToLogin')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

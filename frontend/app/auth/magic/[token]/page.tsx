'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

export default function MagicVerifyPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!token) return;

    api.auth.magicVerify(token)
      .then(() => {
        setVerifying(false);
        setTimeout(() => router.replace('/dashboard'), 1500);
      })
      .catch(() => {
        setVerifying(false);
        setError(t('auth.magicLinkInvalid'));
      });
  }, [token, router, t]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter mb-1" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('common.brand')}
          </h1>
        </div>

        {verifying && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="text-secondary">{t('auth.magicVerifying')}</p>
          </div>
        )}

        {!verifying && !error && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <p className="text-primary font-medium">{t('auth.magicVerified')}</p>
            <p className="text-muted text-sm">{t('auth.magicRedirecting')}</p>
          </div>
        )}

        {!verifying && error && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
            <a
              href="/login"
              className="text-primary-color hover:text-[#2563EB]/80 transition-colors text-sm"
            >
              {t('auth.backToLogin')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

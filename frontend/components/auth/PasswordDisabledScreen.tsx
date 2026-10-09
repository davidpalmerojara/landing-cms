'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PasswordDisabledScreenProps {
  onContinue: () => void;
}

/**
 * Shown after a magic link or Google sign-in took over an account whose
 * password had never been confirmed by email (the backend disabled it and
 * closed the other sessions).
 */
const PasswordDisabledScreen = ({ onContinue }: PasswordDisabledScreenProps) => {
  const t = useTranslations('auth');

  return (
    <div id="main-content" className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div role="status" className="w-full max-w-[calc(100vw-32px)] sm:max-w-sm bg-surface-card border border-default rounded-xl p-6">
        <ShieldCheck className="w-8 h-8 text-success mb-4" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-primary mb-2">{t('passwordDisabledTitle')}</h1>
        <p className="text-sm text-secondary leading-relaxed mb-6">{t('passwordDisabledBody')}</p>
        <button
          type="button"
          onClick={onContinue}
          autoFocus
          className="w-full min-h-11 text-white text-sm font-bold py-2.5 rounded-lg shadow-lg transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
        >
          {t('passwordDisabledContinue')}
        </button>
      </div>
    </div>
  );
};

export default PasswordDisabledScreen;

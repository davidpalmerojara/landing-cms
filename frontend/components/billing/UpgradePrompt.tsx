'use client';

import { Crown, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface UpgradePromptProps {
  feature: string;
  description?: string;
  className?: string;
  compact?: boolean;
}

export default function UpgradePrompt({ feature, description, className = '', compact = false }: UpgradePromptProps) {
  const router = useRouter();
  const t = useTranslations();

  if (compact) {
    return (
      <button
        onClick={() => router.push('/settings/billing')}
        className={`flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded-lg px-3 py-2 transition-colors ${className}`}
      >
        <Crown className="w-3.5 h-3.5 shrink-0" />
        <span>{t('upgrade.compact', { feature })}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
      </button>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4">
        <Crown className="w-7 h-7 text-amber-400" />
      </div>
      <h3 className="text-lg font-semibold text-primary mb-2">{feature}</h3>
      <p className="text-sm text-muted mb-6 max-w-sm">
        {description || t('upgrade.description')}
      </p>
      <button
        onClick={() => router.push('/settings/billing')}
        className="flex items-center gap-2 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
      >
        <Crown className="w-4 h-4" />
        {t('upgrade.cta')}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

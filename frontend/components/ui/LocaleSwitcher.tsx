'use client';

import clsx from 'clsx';
import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/providers/AppIntlProvider';
import type { AppLocale } from '@/lib/i18n';

interface LocaleSwitcherProps {
  className?: string;
}

export default function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const t = useTranslations('preferences');
  const { locale, setLocale } = useAppLocale();
  const options: AppLocale[] = ['es', 'en'];

  return (
    <div
      aria-label={t('language')}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg border border-default/15 bg-surface-card/80 p-1 backdrop-blur-sm',
        className,
      )}
    >
      <Languages className="ml-1 h-4 w-4 text-secondary" />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={clsx(
            'min-h-9 rounded-md px-2.5 text-xs font-bold uppercase tracking-wider transition-colors',
            locale === option
              ? 'bg-primary text-white'
              : 'text-secondary hover:bg-surface-elevated/80 hover:text-primary',
          )}
          title={option === 'es' ? t('languageEs') : t('languageEn')}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

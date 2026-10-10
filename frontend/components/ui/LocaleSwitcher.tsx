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
    // A group, so the label is announced; each button is read in its own language
    <div
      role="group"
      aria-label={t('language')}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg border border-default/15 bg-surface-card/80 p-1 backdrop-blur-sm',
        className,
      )}
    >
      <Languages className="ml-1 h-4 w-4 text-secondary" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          // 44 px on touch screens (WCAG 2.5.8 asks 24, the project 44), compact with a mouse
          className={clsx(
            'min-h-9 rounded-md px-2.5 text-xs font-bold uppercase tracking-wider transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11',
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

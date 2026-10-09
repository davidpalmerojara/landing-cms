'use client';

import clsx from 'clsx';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useStartGuest } from '@/hooks/useStartGuest';

interface GuestStartButtonProps {
  /** hero: large pill for the landing page; form: full-width button under the login and register forms */
  variant: 'hero' | 'form';
  className?: string;
}

const variantClasses = {
  hero: 'w-full sm:w-auto px-8 py-4 rounded-full font-extrabold text-lg border border-primary/40 text-primary-color hover:bg-primary/10',
  form: 'w-full py-2.5 rounded-lg text-sm font-medium border border-subtle hover:border-default text-secondary hover:text-primary',
} as const;

export default function GuestStartButton({ variant, className }: GuestStartButtonProps) {
  const t = useTranslations();
  const { start, isStarting, error } = useStartGuest();

  return (
    <div className={clsx(variant === 'form' ? 'w-full' : 'w-full sm:w-auto', className)}>
      <button
        type="button"
        onClick={start}
        disabled={isStarting}
        aria-busy={isStarting}
        className={clsx(
          'min-h-11 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2',
          variantClasses[variant],
        )}
      >
        {isStarting
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <Sparkles className="w-4 h-4" aria-hidden="true" />}
        {isStarting ? t('guest.starting') : t('guest.tryButton')}
      </button>
      <p className={clsx('mt-2 text-xs text-muted', variant === 'form' && 'text-center')}>{t('guest.hint')}</p>
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-left text-sm text-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

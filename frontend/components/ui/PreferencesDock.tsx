'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';

export default function PreferencesDock() {
  const pathname = usePathname();
  const t = useTranslations('preferences');

  if (pathname.startsWith('/p/')) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 rounded-xl border border-default/15 bg-surface-card/85 p-2 shadow-2xl backdrop-blur-xl md:bottom-auto md:top-4">
      <span className="sr-only">{t('appearance')}</span>
      <ThemeToggle />
      <LocaleSwitcher />
    </div>
  );
}

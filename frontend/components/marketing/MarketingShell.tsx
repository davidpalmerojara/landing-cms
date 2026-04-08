'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface MarketingShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function MarketingShell({ title, subtitle, children }: MarketingShellProps) {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-surface text-secondary">
      <header className="sticky top-0 z-40 border-b border-subtle/60 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-2xl font-black tracking-tighter"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('common.brand')}
          </Link>

          <nav aria-label={t('navigation.main')} className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="/" className="text-muted transition-colors hover:text-primary">{t('navigation.home')}</Link>
            <Link href="/pricing" className="text-muted transition-colors hover:text-primary">{t('navigation.pricing')}</Link>
            <Link href="/about" className="text-muted transition-colors hover:text-primary">{t('navigation.about')}</Link>
            <Link href="/contact" className="text-muted transition-colors hover:text-primary">{t('navigation.contact')}</Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
            <Link href="/login" className="hidden text-sm font-medium text-muted transition-colors hover:text-primary sm:block">
              {t('navigation.login')}
            </Link>
            <Link
              href="/register"
              className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('navigation.register')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <section className="mb-14 max-w-3xl">
          <h1 className="text-4xl font-black tracking-tight text-primary md:text-6xl">{title}</h1>
          {subtitle ? <p className="mt-4 text-lg leading-8 text-muted">{subtitle}</p> : null}
        </section>
        {children}
      </main>

      <footer className="border-t border-subtle/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 text-sm text-muted md:flex-row md:items-center">
          <p>&copy; 2026 Paxl. {t('marketing.home.footerLegal')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-primary">{t('navigation.privacy')}</Link>
            <Link href="/terms" className="transition-colors hover:text-primary">{t('navigation.terms')}</Link>
            <Link href="/changelog" className="transition-colors hover:text-primary">{t('marketing.pages.changelog.title')}</Link>
            <Link href="/contact" className="transition-colors hover:text-primary">{t('navigation.contact')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

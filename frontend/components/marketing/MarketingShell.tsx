'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import MobileMenu from './MobileMenu';

interface MarketingShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function MarketingShell({ title, subtitle, children }: MarketingShellProps) {
  const t = useTranslations();
  const pathname = usePathname();

  const links = [
    { href: '/', label: t('navigation.home') },
    { href: '/pricing', label: t('navigation.pricing') },
    { href: '/about', label: t('navigation.about') },
    { href: '/contact', label: t('navigation.contact') },
  ];

  return (
    <div className="min-h-screen bg-surface text-secondary">
      <header className="sticky top-0 z-40 border-b border-subtle/60 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-2xl font-black tracking-tighter"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('common.brand')}
          </Link>

          <nav aria-label={t('navigation.main')} className="hidden items-center gap-6 text-sm font-medium md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === pathname ? 'page' : undefined}
                className="text-muted transition-colors hover:text-primary aria-[current=page]:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
            {/* Always visible: on a phone this is the only way back in for someone who already has an account */}
            <Link
              href="/login"
              className="flex min-h-11 items-center px-2 text-sm font-medium text-muted transition-colors hover:text-primary sm:px-3"
            >
              {t('navigation.login')}
            </Link>
            <Link
              href="/register"
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('navigation.register')}
            </Link>
            <MobileMenu links={links} />
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
          <div className="flex flex-wrap items-center gap-x-4">
            <Link href="/privacy" className="flex min-h-11 items-center transition-colors hover:text-primary">{t('navigation.privacy')}</Link>
            <Link href="/terms" className="flex min-h-11 items-center transition-colors hover:text-primary">{t('navigation.terms')}</Link>
            <Link href="/changelog" className="flex min-h-11 items-center transition-colors hover:text-primary">{t('marketing.pages.changelog.title')}</Link>
            <Link href="/contact" className="flex min-h-11 items-center transition-colors hover:text-primary">{t('navigation.contact')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

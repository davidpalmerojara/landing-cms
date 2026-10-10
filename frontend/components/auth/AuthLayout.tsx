'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';

interface AuthLayoutProps {
  /** The page heading: "Iniciar sesión" / "Crear cuenta" (the brand is a link, not the heading) */
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

/**
 * Frame of the login and register pages: a way back to the home page, the page
 * heading, and theme and language switches, which on a phone are otherwise
 * reachable only from the landing page (QA-058, QA-069).
 */
export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const t = useTranslations();

  return (
    <main id="main-content" tabIndex={-1} className="relative min-h-screen bg-surface flex items-center justify-center px-4 py-16 outline-none">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
        <LocaleSwitcher />
      </div>

      <div className="w-full max-w-[calc(100vw-32px)] sm:max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Link
            href="/"
            aria-label={t('auth.backToHome')}
            className="min-h-11 inline-flex items-center text-2xl font-black tracking-tighter text-primary-color"
          >
            {t('common.brand')}
          </Link>
          <h1 className="mt-2 text-xl font-bold text-primary">{title}</h1>
          <p className="text-sm text-muted mt-1">{subtitle}</p>
        </div>

        {children}
      </div>
    </main>
  );
}

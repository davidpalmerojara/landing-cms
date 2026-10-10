'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, Globe, LayoutGrid, Palette, Smartphone } from 'lucide-react';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { tokenPresets } from '@/lib/design-tokens';
import GuestStartButton from '@/components/guest/GuestStartButton';
import MobileMenu from '@/components/marketing/MobileMenu';
import { toContentLocale } from '@/lib/content-locale';
import { useAccountDeletedNotice } from '@/hooks/useAccountDeletedNotice';

export default function LandingPage() {
  const t = useTranslations();
  // Product screenshots in the visitor's language
  const shotLocale = toContentLocale(useLocale());
  const accountDeleted = useAccountDeletedNotice();
  const menuLinks = [
    { href: '#features', label: t('navigation.features') },
    { href: '#how-it-works', label: t('navigation.howItWorks') },
    { href: '/pricing', label: t('navigation.pricing') },
    { href: '/about', label: t('navigation.about') },
    { href: '/contact', label: t('navigation.contact') },
  ];

  return (
    <div id="main-content" className="min-h-screen bg-surface font-sans text-secondary selection:bg-primary/30">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/70 backdrop-blur-xl border-b border-subtle/50" aria-label={t('navigation.main')}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-black tracking-tighter text-primary-color"
          >
            {t('common.brand')}
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#features" className="text-secondary hover:text-primary transition-colors">{t('navigation.features')}</a>
            <a href="#how-it-works" className="text-secondary hover:text-primary transition-colors">{t('navigation.howItWorks')}</a>
            <Link href="/pricing" className="text-secondary hover:text-primary transition-colors">{t('navigation.pricing')}</Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-4">
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
            {/* Always visible: on a phone this is the only way back in for someone who already has an account */}
            <Link href="/login" className="flex min-h-11 items-center px-2 text-sm font-medium text-secondary hover:text-primary transition-colors">
              {t('marketing.home.login')}
            </Link>
            <Link
              href="/register"
              className="flex min-h-11 items-center bg-primary hover:bg-primary-dark text-white text-sm font-medium px-4 sm:px-5 rounded-full shadow-lg transition-all active:scale-95"
            >
              {t('marketing.home.register')}
            </Link>
            <MobileMenu links={menuLinks} />
          </div>
        </div>
      </nav>

      {accountDeleted && (
        <p role="status" className="fixed top-16 left-0 right-0 z-40 border-b border-success/30 bg-success/10 px-6 py-3 text-center text-sm text-secondary backdrop-blur-xl">
          {t('marketing.home.accountDeletedNotice')}
        </p>
      )}

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 md:pt-44 md:pb-24 overflow-hidden" aria-label={t('marketing.home.heroSection')}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[120px] -z-10 bg-primary/10" />

        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-primary leading-[0.95] mb-8 max-w-5xl mx-auto">
            {t('marketing.home.heroTitleBefore')}{' '}
            <span className="text-primary-color">{t('marketing.home.heroTitleAccent')}</span>
          </h1>

          <p className="text-lg md:text-xl text-secondary font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('marketing.home.heroSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/register"
              className="w-full sm:w-auto bg-primary hover:bg-primary-dark text-white px-8 py-4 rounded-full font-extrabold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {t('marketing.home.ctaPrimary')}
            </Link>
            <GuestStartButton variant="hero" />
            <a
              href="#how-it-works"
              className="w-full sm:w-auto bg-surface-card/80 border border-default/30 text-primary-color px-8 py-4 rounded-full font-extrabold text-lg transition-colors flex items-center justify-center gap-2 hover:bg-surface-card"
            >
              {t('marketing.home.ctaSecondary')}
              <ArrowDown className="w-5 h-5" aria-hidden="true" />
            </a>
          </div>

          <div className="max-w-6xl mx-auto rounded-2xl border border-default/30 overflow-hidden shadow-2xl shadow-primary/10">
            <Image
              src={`/landing/editor-${shotLocale}.webp`}
              alt={t('marketing.home.heroImageAlt')}
              width={1440}
              height={900}
              priority
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-surface scroll-mt-16" aria-label={t('marketing.home.featuresSection')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-primary mb-4">
              {t('marketing.home.featuresTitleBefore')}{' '}
              <span className="text-primary-color">{t('marketing.home.featuresTitleAccent')}</span>
            </h2>
            <p className="text-lg text-secondary max-w-2xl mx-auto">
              {t('marketing.home.featuresSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Blocks */}
            <div className="col-span-12 md:col-span-7 bg-surface-elevated/50 rounded-xl p-8">
              <LayoutGrid className="w-8 h-8 mb-4 text-primary-color" aria-hidden="true" />
              <h3 className="text-2xl font-bold text-primary mb-2">{t('marketing.home.blocksTitle')}</h3>
              <p className="text-secondary leading-relaxed">{t('marketing.home.blocksDescription')}</p>
            </div>

            {/* Theme */}
            <div className="col-span-12 md:col-span-5 bg-surface-elevated/50 rounded-xl p-8 flex flex-col">
              <Palette className="w-8 h-8 mb-4 text-primary-color" aria-hidden="true" />
              <h3 className="text-2xl font-bold text-primary mb-2">{t('marketing.home.themeTitle')}</h3>
              <p className="text-secondary leading-relaxed mb-6">{t('marketing.home.themeDescription')}</p>
              <ul className="mt-auto flex flex-wrap gap-3" aria-label={t('marketing.home.themePresetsLabel')}>
                {tokenPresets.slice(0, 4).map((preset) => (
                  <li key={preset.id} className="flex rounded-full overflow-hidden border border-default/30" title={preset.name}>
                    {[preset.colors.primary, preset.colors.secondary, preset.colors.accent, preset.colors.background].map((color) => (
                      <span key={color} className="w-5 h-5" style={{ backgroundColor: color }} />
                    ))}
                  </li>
                ))}
              </ul>
            </div>

            {/* Responsive + mobile editor */}
            <div className="col-span-12 md:col-span-5 bg-surface-elevated/50 rounded-xl p-8 flex flex-col overflow-hidden">
              <Smartphone className="w-8 h-8 mb-4 text-primary-color" aria-hidden="true" />
              <h3 className="text-2xl font-bold text-primary mb-2">{t('marketing.home.responsiveTitle')}</h3>
              <p className="text-secondary leading-relaxed mb-8">{t('marketing.home.responsiveDescription')}</p>
              <Image
                src={`/landing/mobile-${shotLocale}.webp`}
                alt={t('marketing.home.mobileImageAlt')}
                width={600}
                height={1298}
                className="w-56 h-auto mx-auto -mb-40 rounded-3xl border-4 border-surface-card shadow-xl"
              />
            </div>

            {/* Publish */}
            <div className="col-span-12 md:col-span-7 bg-surface-elevated/50 rounded-xl p-8 flex flex-col overflow-hidden">
              <Globe className="w-8 h-8 mb-4 text-primary-color" aria-hidden="true" />
              <h3 className="text-2xl font-bold text-primary mb-2">{t('marketing.home.publishTitle')}</h3>
              <p className="text-secondary leading-relaxed mb-8">{t('marketing.home.publishDescription')}</p>
              <Image
                src={`/landing/published-${shotLocale}.webp`}
                alt={t('marketing.home.publishedImageAlt')}
                width={1440}
                height={900}
                className="w-full h-auto rounded-lg border border-default/30 mt-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-surface-elevated/30 scroll-mt-16" aria-labelledby="how-it-works-title">
        <div className="max-w-5xl mx-auto px-6">
          <h2 id="how-it-works-title" className="text-4xl md:text-5xl font-black tracking-tighter text-primary mb-12 text-center">
            {t('marketing.home.howTitle')}
          </h2>
          <ol className="grid md:grid-cols-3 gap-6">
            {([1, 2, 3] as const).map((step) => (
              <li key={step} className="bg-surface rounded-xl p-6 border border-default/20">
                <span className="w-9 h-9 rounded-full bg-primary/10 text-primary-color font-black flex items-center justify-center mb-4" aria-hidden="true">
                  {step}
                </span>
                <h3 className="text-lg font-bold text-primary mb-2">{t(`marketing.home.step${step}Title`)}</h3>
                <p className="text-secondary leading-relaxed text-sm">{t(`marketing.home.step${step}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 relative overflow-hidden" aria-label={t('marketing.home.ctaSection')}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-primary mb-8">
            {t('marketing.home.finalTitleBefore')}{' '}
            <span className="text-primary-color">{t('marketing.home.finalTitleAccent')}</span>
          </h2>
          <Link
            href="/register"
            className="inline-block bg-primary hover:bg-primary-dark text-white px-10 py-5 rounded-full font-black text-xl transition-all active:scale-95 shadow-xl shadow-primary/20 mb-6"
          >
            {t('marketing.home.finalCta')}
          </Link>
          <p className="text-muted text-sm">
            {t('marketing.home.finalNote')}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface border-t border-surface-elevated py-16" aria-label={t('marketing.home.footerSection')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-16">
            {/* Logo Column */}
            <div className="col-span-2 md:col-span-1">
              <span className="text-lg font-bold text-primary block mb-3">{t('common.brand')}</span>
              <p className="text-muted text-xs uppercase tracking-widest">
                {t('marketing.home.footerTagline')}
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.product')}</h3>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="#features" className="hover:text-primary-color transition-colors">{t('navigation.features')}</a></li>
                <li><Link href="/pricing" className="hover:text-primary-color transition-colors">{t('navigation.pricing')}</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.company')}</h3>
              <ul className="space-y-2 text-sm text-muted">
                <li><Link href="/about" className="hover:text-primary-color transition-colors">{t('navigation.about')}</Link></li>
                <li><Link href="/changelog" className="hover:text-primary-color transition-colors">{t('marketing.pages.changelog.title')}</Link></li>
                <li><Link href="/privacy" className="hover:text-primary-color transition-colors">{t('navigation.privacy')}</Link></li>
                <li><Link href="/terms" className="hover:text-primary-color transition-colors">{t('navigation.terms')}</Link></li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h3 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.connect')}</h3>
              <ul className="space-y-2 text-sm text-muted">
                <li><Link href="/contact" className="hover:text-primary-color transition-colors">{t('navigation.contact')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-subtle/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-muted text-sm">&copy; 2026 Paxl. {t('marketing.home.footerLegal')}</p>
            <div className="flex items-center gap-4 text-muted">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

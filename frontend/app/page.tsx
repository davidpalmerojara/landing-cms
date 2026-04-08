'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  MousePointer2, Zap, Smartphone, PlayCircle,
} from 'lucide-react';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';

const gradientStyle = {
  background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
} as const;

export default function LandingPage() {
  const t = useTranslations();

  return (
    <div id="main-content" className="min-h-screen bg-surface font-sans text-secondary selection:bg-[#2563EB]/30">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/70 backdrop-blur-xl border-b border-subtle\/50" aria-label={t('navigation.main')}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-black tracking-tighter"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('common.brand')}
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#features" className="text-primary-color hover:text-white transition-colors">{t('navigation.features')}</a>
            <a href="#how-it-works" className="text-secondary hover:text-white transition-colors">{t('navigation.howItWorks')}</a>
            <Link href="/pricing" className="text-secondary hover:text-white transition-colors">{t('navigation.pricing')}</Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
            <Link href="/login" className="hidden md:block text-sm font-medium text-secondary hover:text-white transition-colors">
              {t('marketing.home.login')}
            </Link>
            <Link
              href="/register"
              className="text-white text-sm font-medium px-5 py-2 rounded-full shadow-lg transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('marketing.home.register')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden" aria-label={t('marketing.home.heroSection')}>
        {/* Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[120px] -z-10" style={{ background: 'rgba(37, 99, 235, 0.1)' }} />

        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white leading-[0.9] mb-8 max-w-5xl mx-auto">
            {t('marketing.home.heroTitleBefore')}{' '}
            <span style={gradientStyle}>{t('marketing.home.heroTitleAccent')}</span>
          </h1>

          <p className="text-xl md:text-2xl text-secondary font-medium max-w-3xl mx-auto mb-12 leading-relaxed">
            {t('marketing.home.heroSubtitle')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto text-white px-8 py-4 rounded-full font-extrabold text-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('marketing.home.ctaPrimary')}
            </Link>
            <a
              href="#demo"
              className="w-full sm:w-auto bg-surface-card\/80 border border-default/30 px-8 py-4 rounded-full font-extrabold text-lg transition-colors flex items-center justify-center gap-2 hover:bg-surface-card"
              style={{ color: '#2563EB' }}
            >
              <PlayCircle className="w-5 h-5" />
              {t('marketing.home.ctaSecondary')}
            </a>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 border-y border-subtle/20" aria-label={t('marketing.home.socialProofSection')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-40 grayscale">
            <span className="text-xl font-bold tracking-widest uppercase">Acme Corp</span>
            <span className="text-xl font-bold tracking-widest uppercase">Globex</span>
            <span className="text-xl font-bold tracking-widest uppercase">Soylent</span>
            <span className="text-xl font-bold tracking-widest uppercase">INITECH</span>
            <span className="text-xl font-bold tracking-widest uppercase">Umbrella</span>
          </div>
        </div>
      </section>

      {/* Feature Grid — Bento Style */}
      <section id="features" className="py-24 bg-surface" aria-label={t('marketing.home.featuresSection')}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
              {t('marketing.home.featuresTitleBefore')}{' '}
              <span style={gradientStyle}>{t('marketing.home.featuresTitleAccent')}</span>
            </h2>
            <p className="text-xl text-secondary max-w-2xl mx-auto">
              {t('marketing.home.featuresSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Large Card — Drag & Drop */}
            <div className="col-span-12 md:col-span-8 relative bg-surface-elevated\/50 rounded-xl p-8 transition-all hover:bg-surface-card\/50 overflow-hidden group">
              <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] -z-0" style={{ background: 'rgba(37, 99, 235, 0.1)' }} />
              <div className="relative z-10">
                <MousePointer2 className="w-8 h-8 mb-4" style={{ color: '#2563EB' }} />
                <h3 className="text-3xl font-bold text-white mb-2">{t('marketing.home.dragDropTitle')}</h3>
                <p className="text-secondary leading-relaxed mb-6 max-w-lg">
                  {t('marketing.home.dragDropDescription')}
                </p>
                <div className="bg-surface-elevated\/80 rounded-lg p-4 border border-subtle\/30 aspect-video flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235,0.05) 0%, rgba(37, 99, 235,0.05) 100%)' }}>
                  <div className="w-full h-full rounded bg-surface-card/40 flex items-center justify-center text-muted text-sm">
                    {t('marketing.home.interfacePreview')}
                  </div>
                </div>
              </div>
            </div>

            {/* Small Card — Rendimiento Extremo */}
            <div className="col-span-12 md:col-span-4 bg-surface-elevated\/50 rounded-xl p-8 transition-all hover:bg-surface-card\/50 flex flex-col justify-between">
              <div>
                <Zap className="w-8 h-8 mb-4" style={{ color: '#2563EB' }} />
                <h3 className="text-xl font-bold text-white mb-2">{t('marketing.home.performanceTitle')}</h3>
                <p className="text-secondary leading-relaxed text-sm">
                  {t('marketing.home.performanceDescription')}
                </p>
              </div>
              <div className="mt-6">
                <span className="text-6xl font-black text-white">99</span>
                <p className="text-muted text-sm mt-1">{t('marketing.home.performanceScore')}</p>
              </div>
            </div>

            {/* Small Card — Diseño Responsive */}
            <div className="col-span-12 md:col-span-4 bg-surface-elevated\/50 rounded-xl p-8 transition-all hover:bg-surface-card\/50">
              <Smartphone className="w-8 h-8 mb-4" style={{ color: '#ff59e3' }} />
              <h3 className="text-xl font-bold text-white mb-2">{t('marketing.home.responsiveTitle')}</h3>
              <p className="text-secondary leading-relaxed text-sm">
                {t('marketing.home.responsiveDescription')}
              </p>
            </div>

            {/* Large Card — Editor Mockup */}
            <div className="col-span-12 md:col-span-8 bg-surface-elevated\/50 rounded-xl p-8 transition-all hover:bg-surface-card\/50 overflow-hidden group">
              <div className="rounded-lg border border-subtle\/30 overflow-hidden transition-transform duration-700 group-hover:scale-[1.02]">
                {/* Fake Browser Chrome */}
                <div className="h-10 border-b border-subtle\/50 flex items-center px-4 gap-4 bg-surface-elevated\/80">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <div className="flex-1 max-w-xs mx-auto bg-surface h-6 rounded-md border border-subtle flex items-center justify-center text-[10px] text-muted font-mono">
                    paxl.app/editor
                  </div>
                </div>
                {/* Editor Placeholder */}
                <div className="aspect-video flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235,0.08) 0%, rgba(37, 99, 235,0.08) 100%)' }}>
                  <div className="text-muted text-sm">{t('marketing.home.editorPreview')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Editor Highlight Section */}
      <section id="how-it-works" className="py-24 bg-surface-elevated\/30" aria-label={t('marketing.home.editorSection')}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter text-white mb-12">
            {t('marketing.home.editorTitleBefore')}{' '}
            <span style={gradientStyle}>{t('marketing.home.editorTitleAccent')}</span>
          </h2>

          <div className="relative max-w-5xl mx-auto">
            {/* Glow behind */}
            <div className="absolute inset-0 -z-10 blur-[100px] rounded-full" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235,0.15) 0%, rgba(37, 99, 235,0.15) 100%)' }} />
            <div className="border border-subtle\/30 rounded-2xl overflow-hidden">
              <div className="bg-surface-elevated\/50 rounded-xl aspect-video flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235,0.05) 0%, rgba(37, 99, 235,0.05) 100%)' }}>
                <div className="text-muted text-lg">{t('marketing.home.canvasPreview')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-40 relative overflow-hidden" aria-label={t('marketing.home.ctaSection')}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full blur-[150px] -z-10" style={{ background: 'rgba(37, 99, 235, 0.05)' }} />
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter text-white mb-8">
            {t('marketing.home.finalTitleBefore')}{' '}
            <span style={gradientStyle}>{t('marketing.home.finalTitleAccent')}</span>
          </h2>
          <a
            href="/register"
            className="inline-block text-white px-12 py-6 rounded-full font-black text-xl transition-all hover:scale-105 active:scale-95 shadow-xl mb-6"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {t('marketing.home.finalCta')}
          </a>
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
              <span className="text-lg font-bold text-white block mb-3">{t('common.brand')}</span>
              <p className="text-muted text-xs uppercase tracking-widest">
                {t('marketing.home.footerTagline')}
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.product')}</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="#features" className="hover:text-primary-color transition-colors">{t('navigation.features')}</a></li>
                <li><Link href="/register" className="hover:text-primary-color transition-colors">{t('navigation.templates')}</Link></li>
                <li><Link href="/pricing" className="hover:text-primary-color transition-colors">{t('navigation.pricing')}</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.company')}</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><Link href="/about" className="hover:text-primary-color transition-colors">{t('navigation.about')}</Link></li>
                <li><Link href="/changelog" className="hover:text-primary-color transition-colors">{t('marketing.pages.changelog.title')}</Link></li>
                <li><Link href="/privacy" className="hover:text-primary-color transition-colors">{t('navigation.privacy')}</Link></li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="text-muted text-xs uppercase tracking-widest font-semibold mb-4">{t('navigation.connect')}</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="#" className="hover:text-primary-color transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-primary-color transition-colors">Instagram</a></li>
                <li><Link href="/contact" className="hover:text-primary-color transition-colors">{t('navigation.support')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-subtle\/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-muted text-sm">&copy; 2026 Paxl Inc. {t('marketing.home.footerLegal')}</p>
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

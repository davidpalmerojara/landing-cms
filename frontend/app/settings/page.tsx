'use client';

import { useRouter } from 'next/navigation';
import { Globe, ChevronRight, User, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function SettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth({ redirectTo: '/login' });

  if (isAuthLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-secondary">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-secondary">
      {/* Header */}
      <header className="border-b border-subtle\/80">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-muted hover:text-secondary p-1.5 rounded-md hover:bg-surface-card\/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xl font-black tracking-tighter" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('common.brand')}</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-primary mb-1">{t('settingsPage.title')}</h1>
        <p className="text-sm text-muted mb-8">{t('settingsPage.subtitle')}</p>

        <div className="space-y-3">
          {/* Domains link card */}
          <button
            onClick={() => router.push('/settings/domains')}
            className="w-full flex items-center gap-4 p-5 bg-surface-elevated\/50 border border-subtle\/80 rounded-xl hover:border-default transition-all text-left group"
          >
            <div className="w-10 h-10 bg-primary\/10 border border-primary/20 rounded-lg flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-primary-color" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-primary">{t('settingsPage.domainsTitle')}</h3>
              <p className="text-xs text-muted mt-0.5">{t('settingsPage.domainsDescription')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted group-hover:text-secondary transition-colors shrink-0" />
          </button>

          {/* Account placeholder — coming soon */}
          <div className="w-full flex items-center gap-4 p-5 bg-surface-elevated\/30 border border-subtle\/50 rounded-xl opacity-50 cursor-not-allowed">
            <div className="w-10 h-10 bg-surface-card border border-default/50 rounded-lg flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-secondary">{t('settingsPage.accountTitle')}</h3>
                <span className="text-[10px] font-medium text-muted bg-surface-card px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {t('common.comingSoon')}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">{t('settingsPage.accountDescription')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted shrink-0" />
          </div>
        </div>
      </main>
    </div>
  );
}

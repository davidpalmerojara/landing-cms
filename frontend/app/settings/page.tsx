'use client';

import { useRouter } from 'next/navigation';
import { Globe, ChevronRight, User, ArrowLeft, CreditCard, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/useAuth';
import { useBillingEnabled } from '@/hooks/useBillingEnabled';
import { useFeatures } from '@/hooks/useFeatures';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Link from 'next/link';

export default function SettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, isLoading: isAuthLoading, logout } = useAuth({ redirectTo: '/login' });
  const { features } = useFeatures();
  const { billingEnabled } = useBillingEnabled();
  // Hidden unless this deployment has custom domains (ADR-027)
  const showDomains = features?.custom_domains === true;

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
      <header className="border-b border-subtle/80">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label={t('common.backToDashboard')}
            className="w-11 h-11 flex items-center justify-center text-muted hover:text-secondary rounded-md hover:bg-surface-card/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
          <span className="text-xl font-black tracking-tighter" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('common.brand')}</span>
        </div>
      </header>

      {/* Content */}
      <main id="main-content" className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-primary mb-1">{t('settingsPage.title')}</h1>
        <p className="text-sm text-muted mb-8">{t('settingsPage.subtitle')}</p>

        <div className="space-y-3">
          {/* Account: who is signed in. Changing the email or the password is not offered yet */}
          <section
            aria-labelledby="settings-account-title"
            className="w-full flex items-center gap-4 p-5 bg-surface-elevated/50 border border-subtle/80 rounded-xl"
          >
            <div className="w-10 h-10 bg-surface-card border border-default/50 rounded-lg flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-muted" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="settings-account-title" className="text-sm font-medium text-primary">{t('settingsPage.accountTitle')}</h2>
              <p className="text-xs text-muted mt-0.5 wrap-break-word">
                {user.is_guest ? t('guest.cardBody') : t('settingsPage.accountSignedInAs', { username: user.username, email: user.email })}
              </p>
            </div>
          </section>

          {/* Billing: the plan and its limits. With payments off the page says so instead of selling an upgrade */}
          {!user.is_guest && (
            <button
              type="button"
              onClick={() => router.push('/settings/billing')}
              className="w-full flex items-center gap-4 p-5 min-h-11 bg-surface-elevated/50 border border-subtle/80 rounded-xl hover:border-default transition-all text-left group"
            >
              <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-primary-color" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-primary">{t('settingsPage.billingTitle')}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {billingEnabled ? t('settingsPage.billingDescription') : t('settingsPage.billingDescriptionOff')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted group-hover:text-secondary transition-colors shrink-0" aria-hidden="true" />
            </button>
          )}

          {/* Domains link card (a guest session sees why it is off instead of a dead end) */}
          {!showDomains ? null : user.is_guest ? (
            <div className="w-full flex items-center gap-4 p-5 bg-surface-elevated/30 border border-subtle/50 rounded-xl">
              <div className="w-10 h-10 bg-surface-card border border-default/50 rounded-lg flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-muted" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-secondary">{t('settingsPage.domainsTitle')}</h2>
                <p className="text-xs text-muted mt-0.5">{t('guest.domainsLocked')}</p>
              </div>
            </div>
          ) : (
          <button
            type="button"
            onClick={() => router.push('/settings/domains')}
            className="w-full flex items-center gap-4 p-5 min-h-11 bg-surface-elevated/50 border border-subtle/80 rounded-xl hover:border-default transition-all text-left group"
          >
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-primary-color" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-primary">{t('settingsPage.domainsTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('settingsPage.domainsDescription')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted group-hover:text-secondary transition-colors shrink-0" aria-hidden="true" />
          </button>
          )}

          {/* Appearance and language: on a phone the dashboard header hides them */}
          <section
            aria-labelledby="settings-preferences-title"
            className="w-full flex flex-wrap items-center justify-between gap-4 p-5 bg-surface-elevated/50 border border-subtle/80 rounded-xl"
          >
            <div className="min-w-0">
              <h2 id="settings-preferences-title" className="text-sm font-medium text-primary">{t('settingsPage.preferencesTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('settingsPage.preferencesDescription')}</p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
          </section>

          {/* A guest leaves from the dashboard, which warns that the pages go with the session */}
          {!user.is_guest && (
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full flex items-center gap-4 p-5 min-h-11 bg-surface-elevated/50 border border-subtle/80 rounded-xl hover:border-default transition-all text-left"
            >
              <div className="w-10 h-10 bg-surface-card border border-default/50 rounded-lg flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-muted" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-primary">{t('dashboard.logout')}</span>
            </button>
          )}
        </div>

        <DeleteAccountSection user={user} />
      </main>
    </div>
  );
}

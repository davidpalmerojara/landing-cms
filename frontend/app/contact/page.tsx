'use client';

import { Mail, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function ContactPage() {
  const t = useTranslations();

  return (
    <MarketingShell
      title={t('marketing.pages.contact.title')}
      subtitle={t('marketing.pages.contact.subtitle')}
    >
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-3xl border border-subtle/70 bg-surface-elevated/35 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-color">
            <Mail className="h-5 w-5" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-primary">{t('marketing.pages.contact.officeTitle')}</h2>
          <p className="mt-4 text-sm leading-8 text-muted">{t('marketing.pages.contact.officeBody')}</p>
          <p className="mt-6 text-sm text-secondary">hello@paxl.app</p>
        </aside>

        <form className="rounded-3xl border border-subtle/70 bg-surface-elevated/35 p-8">
          <div className="grid gap-5">
            <label className="grid gap-2 text-sm font-medium text-secondary">
              {t('marketing.pages.contact.email')}
              <input
                type="email"
                className="h-12 rounded-xl border border-subtle/80 bg-surface px-4 text-sm text-primary outline-none transition-colors focus:border-primary/50"
                placeholder="hello@company.com"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              {t('marketing.pages.contact.subject')}
              <input
                type="text"
                className="h-12 rounded-xl border border-subtle/80 bg-surface px-4 text-sm text-primary outline-none transition-colors focus:border-primary/50"
                placeholder={t('marketing.pages.contact.subject')}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-secondary">
              {t('marketing.pages.contact.message')}
              <textarea
                rows={6}
                className="rounded-2xl border border-subtle/80 bg-surface px-4 py-3 text-sm text-primary outline-none transition-colors focus:border-primary/50"
                placeholder={t('marketing.pages.contact.message')}
              />
            </label>
          </div>

          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            <MessageSquare className="h-4 w-4" />
            {t('marketing.pages.contact.send')}
          </button>

          <p className="mt-4 text-sm text-muted">{t('marketing.pages.contact.successNote')}</p>
        </form>
      </div>
    </MarketingShell>
  );
}

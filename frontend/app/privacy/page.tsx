'use client';

import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function PrivacyPage() {
  const t = useTranslations();

  const sections = [1, 2, 3, 4].map((index) => ({
    title: t(`marketing.pages.privacy.section${index}Title`),
    body: t(`marketing.pages.privacy.section${index}Body`),
  }));

  return (
    <MarketingShell
      title={t('marketing.pages.privacy.title')}
      subtitle={`${t('marketing.pages.privacy.updated')}: 26/03/2026`}
    >
      <div className="max-w-4xl space-y-8">
        <p className="text-lg leading-8 text-secondary">{t('marketing.pages.privacy.intro')}</p>
        {sections.map((section) => (
          <article key={section.title} className="rounded-3xl border border-subtle/70 bg-surface-elevated/35 p-8">
            <h2 className="text-2xl font-bold text-primary">{section.title}</h2>
            <p className="mt-4 text-sm leading-8 text-muted">{section.body}</p>
          </article>
        ))}
      </div>
    </MarketingShell>
  );
}

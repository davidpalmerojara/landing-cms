'use client';

import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function ChangelogPage() {
  const t = useTranslations();

  const entries = [1, 2, 3].map((index) => ({
    date: t(`marketing.pages.changelog.entry${index}Date`),
    title: t(`marketing.pages.changelog.entry${index}Title`),
    body: t(`marketing.pages.changelog.entry${index}Body`),
  }));

  return (
    <MarketingShell
      title={t('marketing.pages.changelog.title')}
      subtitle={t('marketing.pages.changelog.subtitle')}
    >
      <div className="max-w-4xl space-y-6">
        {entries.map((entry) => (
          <article key={entry.title} className="rounded-3xl border border-subtle/70 bg-surface-elevated/35 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{entry.date}</p>
            <h2 className="mt-3 text-2xl font-bold text-primary">{entry.title}</h2>
            <p className="mt-4 text-sm leading-8 text-muted">{entry.body}</p>
          </article>
        ))}
      </div>
    </MarketingShell>
  );
}

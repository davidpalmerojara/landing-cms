'use client';

import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function AboutPage() {
  const t = useTranslations();

  const principles = [
    {
      title: t('marketing.pages.about.principle1Title'),
      body: t('marketing.pages.about.principle1Body'),
    },
    {
      title: t('marketing.pages.about.principle2Title'),
      body: t('marketing.pages.about.principle2Body'),
    },
    {
      title: t('marketing.pages.about.principle3Title'),
      body: t('marketing.pages.about.principle3Body'),
    },
  ];

  return (
    <MarketingShell
      title={t('marketing.pages.about.title')}
      subtitle={t('marketing.pages.about.subtitle')}
    >
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-subtle/70 bg-surface-elevated/40 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {t('marketing.pages.about.missionTitle')}
          </p>
          <p className="mt-4 text-lg leading-8 text-secondary">
            {t('marketing.pages.about.missionBody')}
          </p>
        </article>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {t('marketing.pages.about.principlesTitle')}
          </p>
          {principles.map((principle) => (
            <article key={principle.title} className="rounded-3xl border border-subtle/70 bg-surface-elevated/30 p-6">
              <h2 className="text-xl font-bold text-primary">{principle.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

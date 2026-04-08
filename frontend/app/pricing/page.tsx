'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';

export default function PricingPage() {
  const t = useTranslations();

  const plans = [
    {
      key: 'starter',
      description: t('marketing.pages.pricing.starterDescription'),
      features: [
        t('marketing.pages.pricing.starterFeature1'),
        t('marketing.pages.pricing.starterFeature2'),
        t('marketing.pages.pricing.starterFeature3'),
      ],
      highlighted: false,
    },
    {
      key: 'pro',
      description: t('marketing.pages.pricing.proDescription'),
      features: [
        t('marketing.pages.pricing.proFeature1'),
        t('marketing.pages.pricing.proFeature2'),
        t('marketing.pages.pricing.proFeature3'),
      ],
      highlighted: true,
    },
    {
      key: 'enterprise',
      description: t('marketing.pages.pricing.enterpriseDescription'),
      features: [
        t('marketing.pages.pricing.enterpriseFeature1'),
        t('marketing.pages.pricing.enterpriseFeature2'),
        t('marketing.pages.pricing.enterpriseFeature3'),
      ],
      highlighted: false,
    },
  ];

  return (
    <MarketingShell
      title={t('marketing.pages.pricing.title')}
      subtitle={t('marketing.pages.pricing.subtitle')}
    >
      <section className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.key}
            className={`rounded-3xl border p-8 ${
              plan.highlighted
                ? 'border-primary/40 bg-primary/5 shadow-[0_24px_80px_-24px_rgba(37,99,235,0.45)]'
                : 'border-subtle/70 bg-surface-elevated/40'
            }`}
          >
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {t(`marketing.pages.pricing.${plan.key}`)}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">{plan.description}</p>
            </div>

            <ul className="space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-secondary">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-color" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 border-t border-subtle/50 pt-6">
              <p className="text-xs uppercase tracking-widest text-muted">
                {t('marketing.pages.pricing.monthly')} / {t('marketing.pages.pricing.yearly')}
              </p>
              <a
                href={plan.key === 'enterprise' ? '/contact' : '/register'}
                className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                  plan.highlighted ? 'text-white' : 'border border-subtle/80 text-primary'
                }`}
                style={plan.highlighted ? { background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' } : undefined}
              >
                {plan.key === 'enterprise'
                  ? t('marketing.pages.pricing.contactSales')
                  : t('marketing.pages.pricing.cta')}
              </a>
            </div>
          </article>
        ))}
      </section>

      <p className="mt-8 text-sm text-muted">{t('marketing.pages.pricing.note')}</p>
    </MarketingShell>
  );
}

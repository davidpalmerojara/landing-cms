'use client';

import Link from 'next/link';
import { Info, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import MarketingShell from '@/components/marketing/MarketingShell';
import PlanFeatureList from '@/components/billing/PlanFeatureList';
import { usePlans } from '@/hooks/usePlans';
import { planFeatures } from '@/lib/plan-features';

export default function PricingPage() {
  const t = useTranslations();
  const { plans, error, isLoading } = usePlans();

  return (
    <MarketingShell
      title={t('marketing.pages.pricing.title')}
      subtitle={t('marketing.pages.pricing.subtitle')}
    >
      <p className="mb-8 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-color" aria-hidden="true" />
        {t('marketing.pages.pricing.demoNotice')}
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('marketing.pages.pricing.loading')}
        </div>
      )}

      {error && (
        <p className="text-sm text-error" role="alert">{t('marketing.pages.pricing.loadError')}</p>
      )}

      {plans && (
        <section className="grid gap-6 md:grid-cols-2 max-w-4xl">
          {plans.map((plan) => {
            const highlighted = plan.name !== 'free';
            return (
              <article
                key={plan.id}
                className={`rounded-3xl border p-8 flex flex-col ${
                  highlighted
                    ? 'border-primary/40 bg-primary/5 shadow-[0_24px_80px_-24px_rgba(37,99,235,0.45)]'
                    : 'border-subtle/70 bg-surface-elevated/40'
                }`}
              >
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{plan.display_name}</h2>
                <p className="mt-3 mb-8 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-primary">${parseFloat(plan.price_monthly).toFixed(0)}</span>
                  <span className="text-sm text-muted">{t('marketing.pages.pricing.perMonth')}</span>
                </p>

                <PlanFeatureList
                  features={planFeatures(plan, t)}
                  includedLabel={t('billing.included')}
                  notIncludedLabel={t('billing.notIncluded')}
                />

                <Link
                  href="/register"
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                    highlighted ? 'bg-primary hover:bg-primary-dark text-white' : 'border border-subtle/80 text-primary hover:bg-surface-card'
                  }`}
                >
                  {t('marketing.pages.pricing.cta')}
                </Link>
              </article>
            );
          })}
        </section>
      )}

      <p className="mt-8 text-sm text-muted">{t('marketing.pages.pricing.note')}</p>
    </MarketingShell>
  );
}

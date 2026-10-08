import type { useTranslations } from 'next-intl';
import type { ApiBillingPlan } from '@/lib/api';

type Translate = ReturnType<typeof useTranslations>;

export interface PlanFeature {
  key: keyof ApiBillingPlan;
  label: string;
  /** Extra detail such as "3" or "Unlimited"; null for yes/no features. */
  detail: string | null;
  included: boolean;
}

/**
 * Features shown for a plan, derived from the plan's real limits so the
 * pricing page and the billing settings always say the same thing.
 * Only features that exist in the product are listed.
 */
export function planFeatures(plan: ApiBillingPlan, t: Translate): PlanFeature[] {
  const limit = (value: number) => (value === -1 ? t('billing.unlimited') : `${value}`);

  return [
    { key: 'max_pages', label: t('billing.featurePages'), detail: limit(plan.max_pages), included: plan.max_pages !== 0 },
    {
      key: 'max_ai_generations_per_hour',
      label: t('billing.featureAiPerHour'),
      detail: plan.max_ai_generations_per_hour === 0 ? t('billing.notIncluded') : limit(plan.max_ai_generations_per_hour),
      included: plan.max_ai_generations_per_hour !== 0,
    },
    { key: 'has_analytics', label: t('billing.featureAnalytics'), detail: null, included: plan.has_analytics },
    { key: 'has_collaboration', label: t('billing.featureCollaboration'), detail: null, included: plan.has_collaboration },
    { key: 'has_custom_domain', label: t('billing.featureCustomDomain'), detail: null, included: plan.has_custom_domain },
    { key: 'remove_watermark', label: t('billing.featureNoWatermark'), detail: null, included: plan.remove_watermark },
    {
      key: 'max_version_history',
      label: t('billing.featureVersionHistory'),
      detail: plan.max_version_history === -1 ? t('billing.unlimited') : t('billing.versionCount', { count: plan.max_version_history }),
      included: plan.max_version_history !== 0,
    },
  ];
}

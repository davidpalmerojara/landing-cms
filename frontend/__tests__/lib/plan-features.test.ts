import { describe, expect, it } from 'vitest';
import { planFeatures } from '@/lib/plan-features';
import type { ApiBillingPlan } from '@/lib/api';

const t = ((key: string) => key) as Parameters<typeof planFeatures>[1];

const PRO = {
  id: 'p2', name: 'pro', display_name: 'Pro', price_monthly: '19.00', price_yearly: '190.00',
  max_pages: -1, max_ai_generations_per_hour: 10, has_analytics: true, has_collaboration: true,
  has_custom_domain: true, remove_watermark: true, max_version_history: -1,
} as unknown as ApiBillingPlan;

describe('planFeatures', () => {
  it('lists custom domains where the deployment has them', () => {
    const keys = planFeatures(PRO, t, { customDomains: true }).map((feature) => feature.key);

    expect(keys).toContain('has_custom_domain');
  });

  it('leaves them out where it does not, and keeps every other feature', () => {
    const withDomains = planFeatures(PRO, t, { customDomains: true });
    const withoutDomains = planFeatures(PRO, t, { customDomains: false });

    expect(withoutDomains.map((feature) => feature.key)).not.toContain('has_custom_domain');
    expect(withoutDomains).toHaveLength(withDomains.length - 1);
  });
});

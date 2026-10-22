'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiBillingPlan, ApiPayment, ApiSubscription } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

interface BillingOverview {
  plans: ApiBillingPlan[];
  subscription: ApiSubscription | null;
  /** The plan whose features the account has now (Pro for everyone in the demo, ADR-051) */
  effectivePlan: ApiBillingPlan | null;
  demoAllPro: boolean;
  payments: ApiPayment[];
}

const EMPTY_OVERVIEW: BillingOverview = { plans: [], subscription: null, effectivePlan: null, demoAllPro: false, payments: [] };

async function loadBillingOverview(): Promise<BillingOverview> {
  const [plans, subscription, payments] = await Promise.all([
    api.billing.plans(),
    api.billing.subscription(),
    api.billing.payments(),
  ]);
  return {
    plans,
    subscription: subscription.subscription,
    effectivePlan: subscription.effective_plan ?? null,
    demoAllPro: subscription.demo_all_pro === true,
    payments: payments.payments,
  };
}

/**
 * What the billing page shows: the plans, the workspace subscription and the
 * payment history. With `enabled` false (no account yet, or a guest, which has
 * no plan to manage) nothing is requested.
 */
export function useBillingOverview({ enabled }: { enabled: boolean }) {
  const load = useCallback(
    () => (enabled ? loadBillingOverview() : Promise.resolve(EMPTY_OVERVIEW)),
    [enabled],
  );
  const { data, isLoading, hasError, error } = useAsyncData(load);
  const overview = data ?? EMPTY_OVERVIEW;

  return {
    plans: overview.plans,
    subscription: overview.subscription,
    effectivePlan: overview.effectivePlan,
    demoAllPro: overview.demoAllPro,
    payments: overview.payments,
    isLoading,
    hasError,
    error,
  };
}

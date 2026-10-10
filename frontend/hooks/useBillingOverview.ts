'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiBillingPlan, ApiPayment, ApiSubscription } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

interface BillingOverview {
  plans: ApiBillingPlan[];
  subscription: ApiSubscription | null;
  payments: ApiPayment[];
}

const EMPTY_OVERVIEW: BillingOverview = { plans: [], subscription: null, payments: [] };

async function loadBillingOverview(): Promise<BillingOverview> {
  const [plans, subscription, payments] = await Promise.all([
    api.billing.plans(),
    api.billing.subscription(),
    api.billing.payments(),
  ]);
  return { plans, subscription: subscription.subscription, payments: payments.payments };
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
    payments: overview.payments,
    isLoading,
    hasError,
    error,
  };
}

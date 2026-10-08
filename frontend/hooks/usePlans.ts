'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { ApiBillingPlan } from '@/lib/api';

/** Public list of active plans, as configured in the backend. */
export function usePlans() {
  const [plans, setPlans] = useState<ApiBillingPlan[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.billing.plans()
      .then((res) => {
        if (!cancelled) setPlans(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { plans, error, isLoading: plans === null && error === null };
}

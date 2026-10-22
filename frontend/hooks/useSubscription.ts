'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiBillingPlan, ApiSubscription, ApiUsage } from '@/lib/api';

/**
 * Current workspace subscription (plan + limits) and the dashboard totals.
 * `subscription` stays null while loading, on error, or when the workspace has
 * none; callers should hide plan-dependent UI in that case instead of guessing
 * values. `refresh()` asks again (after claiming a guest account, creating or
 * deleting a page), keeping the old values on screen until the new ones arrive.
 * `effectivePlan` is the plan whose limits apply (Pro for everyone while the demo
 * gives every account the Pro features, `demoAllPro`).
 */
export function useSubscription({ enabled = true }: { enabled?: boolean } = {}) {
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<ApiBillingPlan | null>(null);
  const [demoAllPro, setDemoAllPro] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    api.billing.subscription()
      .then((res) => {
        if (cancelled) return;
        setSubscription(res.subscription);
        setUsage(res.usage ?? null);
        setEffectivePlan(res.effective_plan ?? null);
        setDemoAllPro(res.demo_all_pro === true);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  return { subscription, usage, effectivePlan, demoAllPro, error, refresh };
}

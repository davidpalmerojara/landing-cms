'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiSubscription, ApiUsage } from '@/lib/api';

/**
 * Current workspace subscription (plan + limits) and the dashboard totals.
 * `subscription` stays null while loading, on error, or when the workspace has
 * none; callers should hide plan-dependent UI in that case instead of guessing
 * values. `refresh()` asks again (after claiming a guest account, creating or
 * deleting a page), keeping the old values on screen until the new ones arrive.
 */
export function useSubscription({ enabled = true }: { enabled?: boolean } = {}) {
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
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

  return { subscription, usage, error, refresh };
}

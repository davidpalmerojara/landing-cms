'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { ApiSubscription } from '@/lib/api';

/**
 * Current workspace subscription (plan + limits). `subscription` stays null
 * while loading, on error, or when the workspace has none; callers should
 * hide plan-dependent UI in that case instead of guessing values.
 */
export function useSubscription({ enabled = true }: { enabled?: boolean } = {}) {
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    api.billing.subscription()
      .then((res) => {
        if (!cancelled) setSubscription(res.subscription);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { subscription, error };
}

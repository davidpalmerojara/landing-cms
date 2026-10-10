'use client';

import { useFeatures } from '@/hooks/useFeatures';

/**
 * Whether this deployment takes payments (ADR-031): true only with a Stripe test
 * key. `isKnown` is false until the server has answered, so callers can avoid
 * flashing "payments are off" while loading; an unanswered request counts as off.
 */
export function useBillingEnabled() {
  const { features, isLoading } = useFeatures();
  return { billingEnabled: features?.billing === true, isKnown: !isLoading };
}

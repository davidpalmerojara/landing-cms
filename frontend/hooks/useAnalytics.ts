'use client';

import { useCallback } from 'react';
import { api, isPlanLimitError } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

/** Analytics of a page for a period ('7d', '30d', '90d'). */
export function useAnalytics(pageId: string, period: string) {
  const load = useCallback(() => api.analytics.get(pageId, { period }), [pageId, period]);
  const { data, isLoading, hasError, error, reload } = useAsyncData(load);
  const isPlanLimited = hasError && isPlanLimitError(error);

  return {
    data,
    isLoading,
    /** The plan does not include analytics: the panel says so before anything else (QA-044) */
    isPlanLimited,
    /** The load failed for any other reason; `loadError` is what was thrown (turn it into text with apiErrorMessage) */
    hasLoadError: hasError && !isPlanLimited,
    loadError: error,
    reload,
  };
}

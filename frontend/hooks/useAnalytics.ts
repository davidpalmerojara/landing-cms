'use client';

import { useCallback } from 'react';
import { api, isPlanLimitError } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

/** Analytics of a page for a period ('7d', '30d', '90d'). */
export function useAnalytics(pageId: string, period: string) {
  const load = useCallback(() => api.analytics.get(pageId, { period }), [pageId, period]);
  const { data, isLoading, hasError, error, reload } = useAsyncData(load);

  return {
    data,
    isLoading,
    /** The plan does not include analytics (the panel offers the upgrade) */
    isPlanLimited: hasError && isPlanLimitError(error),
    /** The load failed for any other reason; the text to show, or '' when the error has none */
    errorMessage: hasError && !isPlanLimitError(error) ? (error instanceof Error ? error.message : '') : null,
    reload,
  };
}

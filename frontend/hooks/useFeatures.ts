'use client';

import { api } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

// Module-level so its identity never changes: each page asks the server once
const loadFeatures = () => api.features.get();

/**
 * Optional features this deployment offers. `features` is null while loading
 * or when the request failed: callers hide the feature in both cases instead
 * of showing something that may not work.
 */
export function useFeatures() {
  const { data, isLoading } = useAsyncData(loadFeatures);
  return { features: data, isLoading };
}

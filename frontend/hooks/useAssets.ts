'use client';

import { api } from '@/lib/api';
import type { ApiAsset } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

const NO_ASSETS: ApiAsset[] = [];

// Module-level so its identity never changes: the library loads once per mount
const loadAssets = () => api.assets.list().then((res) => res.results);

/** The user's uploaded images. */
export function useAssets() {
  const { data, isLoading, hasError, error, update } = useAsyncData(loadAssets);

  return {
    assets: data ?? NO_ASSETS,
    isLoading: isLoading && !hasError,
    hasError,
    error,
    /** Applies a local change (an upload, a delete) after the server accepted it */
    updateAssets: update,
  };
}

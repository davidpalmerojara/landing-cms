'use client';

import { useCallback, useState } from 'react';
import { api, isPlanLimitError } from '@/lib/api';
import type { ApiPageVersion } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

interface VersionList {
  versions: ApiPageVersion[];
  hasMore: boolean;
  /** Last page of the server's pagination that is in `versions` */
  page: number;
}

const NO_VERSIONS: ApiPageVersion[] = [];

/** Saved versions of a page, newest first, loaded a page at a time. */
export function useVersionHistory(pageId: string) {
  const load = useCallback(
    () => api.versions.list(pageId, 1).then((res): VersionList => ({
      versions: res.results,
      hasMore: res.next !== null,
      page: 1,
    })),
    [pageId],
  );
  const { data, isLoading, hasError, error, update } = useAsyncData(load);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  /** Appends the next page; resolves once it is in the list (or has failed). */
  const loadMore = useCallback(async () => {
    if (!data) return;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const res = await api.versions.list(pageId, data.page + 1);
      update((current) => ({
        versions: [...current.versions, ...res.results],
        hasMore: res.next !== null,
        page: current.page + 1,
      }));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load more versions:', e);
      setLoadMoreFailed(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [pageId, data, update]);

  /** Applies a local change (a rename, a delete) after the server accepted it. */
  const updateVersions = useCallback(
    (change: (current: ApiPageVersion[]) => ApiPageVersion[]) =>
      update((current) => ({ ...current, versions: change(current.versions) })),
    [update],
  );

  return {
    versions: data?.versions ?? NO_VERSIONS,
    hasMore: data?.hasMore ?? false,
    isLoading,
    isLoadingMore,
    loadMoreFailed,
    /** The plan does not keep a history */
    isPlanLimited: hasError && isPlanLimitError(error),
    loadMore,
    updateVersions,
  };
}

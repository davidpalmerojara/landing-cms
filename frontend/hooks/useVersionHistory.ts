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
  /** How many versions the page owner's plan keeps (-1: all), when the server says */
  maxVersions: number | null;
}

const NO_VERSIONS: ApiPageVersion[] = [];

/** The plan's version limit the list endpoint sends next to the results (QA-086). */
function maxVersionsOf(response: object): number | null {
  return 'max_versions' in response && typeof response.max_versions === 'number' ? response.max_versions : null;
}

/**
 * The version the public page is built from: publishing always freezes a new
 * `auto_publish` version (ADR-017), so it is the newest one of that kind. The
 * server refuses to delete it (PUBLISHED_VERSION); the panel does not offer to.
 */
export function publishedVersionId(versions: ApiPageVersion[]): string | null {
  const newestFirst = [...versions].sort((a, b) => b.version_number - a.version_number);
  return newestFirst.find((v) => v.trigger === 'auto_publish')?.id ?? null;
}

/** Saved versions of a page, newest first, loaded a page at a time. */
export function useVersionHistory(pageId: string) {
  const load = useCallback(
    () => api.versions.list(pageId, 1).then((res): VersionList => ({
      versions: res.results,
      hasMore: res.next !== null,
      page: 1,
      maxVersions: maxVersionsOf(res),
    })),
    [pageId],
  );
  const { data, isLoading, hasError, error, reload, update } = useAsyncData(load);
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
        ...current,
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

  const isPlanLimited = hasError && isPlanLimitError(error);

  return {
    versions: data?.versions ?? NO_VERSIONS,
    hasMore: data?.hasMore ?? false,
    isLoading,
    isLoadingMore,
    loadMoreFailed,
    /** The plan does not keep a history */
    isPlanLimited,
    /** The list could not be loaded (not a plan limit): show an error with `reload`, not "no versions" (QA-047) */
    hasLoadError: hasError && !isPlanLimited,
    loadError: error,
    /** How many versions the plan keeps; -1 for all, null when unknown (QA-086) */
    maxVersions: data?.maxVersions ?? null,
    reload,
    loadMore,
    updateVersions,
  };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiPageListItem } from '@/lib/api';

const NO_PAGES: ApiPageListItem[] = [];

interface LoadedList {
  /** The search these pages answer */
  query: string;
  pages: ApiPageListItem[];
  /** Pages matching the search on the server, loaded or not */
  count: number;
  hasMore: boolean;
}

interface Failure {
  query: string;
  error: unknown;
}

/** Appends a page of results, dropping any page the list already holds (a delete shifts the pagination). */
function appendUnique(current: ApiPageListItem[], incoming: ApiPageListItem[]): ApiPageListItem[] {
  const known = new Set(current.map((page) => page.id));
  return [...current, ...incoming.filter((page) => !known.has(page.id))];
}

/**
 * The user's pages for the dashboard (own and shared with them), 20 at a time,
 * following the server's pagination. `search` filters on the server, so it
 * covers pages that are not loaded yet (QA-016). `reload()` fetches again every
 * page already shown, so the list does not collapse when the tab regains focus.
 */
export function usePageList(search: string) {
  const query = search.trim();
  const [list, setList] = useState<LoadedList | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<unknown>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  // How many pages of the current search are on screen; the effect below reads it to reload them all
  const loadedPagesRef = useRef(1);
  const loadedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pagesToLoad = loadedQueryRef.current === query ? loadedPagesRef.current : 1;

    async function fetchPages() {
      let collected: ApiPageListItem[] = [];
      let count = 0;
      let hasMore = false;
      let loaded = 0;
      for (let page = 1; page <= pagesToLoad; page += 1) {
        const response = await api.pages.list({ page, search: query });
        collected = appendUnique(collected, response.results);
        count = response.count;
        hasMore = response.next !== null;
        loaded = page;
        if (!hasMore) break;
      }
      return { collected, count, hasMore, loaded };
    }

    fetchPages()
      .then(({ collected, count, hasMore, loaded }) => {
        if (cancelled) return;
        loadedQueryRef.current = query;
        loadedPagesRef.current = loaded;
        setList({ query, pages: collected, count, hasMore });
        setFailure(null);
        setLoadMoreError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure({ query, error });
      });

    return () => {
      cancelled = true;
    };
  }, [query, reloadCount]);

  const loadMore = useCallback(async () => {
    if (!list || !list.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await api.pages.list({ page: loadedPagesRef.current + 1, search: list.query });
      loadedPagesRef.current += 1;
      setList((current) => (
        current && current.query === list.query
          ? {
            ...current,
            pages: appendUnique(current.pages, response.results),
            count: response.count,
            hasMore: response.next !== null,
          }
          : current
      ));
    } catch (error) {
      setLoadMoreError(error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [list, isLoadingMore]);

  const reload = useCallback(() => {
    // A retry after a failure shows the spinner again instead of the old error
    setFailure(null);
    setReloadCount((n) => n + 1);
  }, []);

  /** Applies a local change (a delete, an unpublish) without waiting for the server */
  const updatePages = useCallback((change: (pages: ApiPageListItem[]) => ApiPageListItem[]) => {
    setList((current) => {
      if (!current) return current;
      const pages = change(current.pages);
      return { ...current, pages, count: Math.max(0, current.count - (current.pages.length - pages.length)) };
    });
  }, []);

  const hasCurrentList = list !== null && list.query === query;
  const currentFailure = failure !== null && failure.query === query ? failure : null;

  return {
    pages: hasCurrentList ? list.pages : NO_PAGES,
    /** Pages matching the current search on the server, or null before the first answer */
    count: hasCurrentList ? list.count : null,
    hasMore: hasCurrentList && list.hasMore,
    /** The first answer for this search has not arrived (a reload keeps the list on screen) */
    isLoading: !hasCurrentList && currentFailure === null,
    isLoadingMore,
    /** The list could not be loaded: show the error and a retry, not an empty state */
    hasError: currentFailure !== null && !hasCurrentList,
    error: currentFailure?.error ?? null,
    loadMoreError,
    loadMore,
    reload,
    updatePages,
  };
}

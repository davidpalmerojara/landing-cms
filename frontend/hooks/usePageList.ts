'use client';

import { api } from '@/lib/api';
import type { ApiPageListItem } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

const NO_PAGES: ApiPageListItem[] = [];

// Module-level so its identity never changes: the list loads once, and again on reload()
const loadPageList = () => api.pages.list().then((res) => res.results);

/** The user's pages for the dashboard (own and shared with them), first page of the list. */
export function usePageList() {
  const { data, isLoading, hasError, error, reload, update } = useAsyncData(loadPageList);

  return {
    pages: data ?? NO_PAGES,
    /** Only the first load: a refresh keeps the list on screen */
    isLoading: isLoading && data === null,
    hasError,
    error,
    reload,
    /** Applies a local change (unpublish, delete) without asking the server again */
    updatePages: update,
  };
}

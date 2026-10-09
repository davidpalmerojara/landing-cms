'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiFormSubmission, PaginatedResponse } from '@/lib/api';

/** Page size of the backend's default pagination. */
const SUBMISSIONS_PAGE_SIZE = 20;

interface LoadResult {
  key: string;
  data: PaginatedResponse<ApiFormSubmission> | null;
  failed: boolean;
}

/** Messages received through the page's contact form, one page at a time, newest first. */
export function useSubmissions(pageId: string) {
  const [pageNumber, setPageNumber] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  const requestKey = `${pageId}:${pageNumber}:${reloadCount}`;

  useEffect(() => {
    let cancelled = false;
    api.submissions.list(pageId, pageNumber)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data, failed: false });
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === 'development') console.error('Failed to load messages:', error);
        if (!cancelled) setResult({ key: requestKey, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, pageNumber, requestKey]);

  const data = result?.data ?? null;
  const isLoading = result === null || result.key !== requestKey;
  const hasError = !isLoading && result.failed;
  const totalPages = data ? Math.max(1, Math.ceil(data.count / SUBMISSIONS_PAGE_SIZE)) : 1;

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  /** Deletes one message. Resolves false when the server refused. */
  const remove = useCallback(async (submissionId: string): Promise<boolean> => {
    try {
      await api.submissions.delete(pageId, submissionId);
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to delete message:', error);
      return false;
    }
    if (data && data.results.length === 1 && pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    } else {
      reload();
    }
    return true;
  }, [pageId, data, pageNumber, reload]);

  return {
    submissions: data?.results ?? [],
    count: data?.count ?? 0,
    page: pageNumber,
    totalPages,
    hasPrevious: pageNumber > 1,
    hasNext: data?.next != null,
    isLoading,
    hasError,
    goToPage: setPageNumber,
    reload,
    remove,
  };
}

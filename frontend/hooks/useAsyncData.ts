'use client';

import { useCallback, useEffect, useState } from 'react';

interface Settled<T> {
  /** The loader this result belongs to: a different loader means the inputs changed */
  load: () => Promise<T>;
  reloadCount: number;
  data: T | null;
  hasError: boolean;
  error: unknown;
}

export interface AsyncData<T> {
  /** Last loaded value for the current loader (kept while reloading); null before the first load or after a first failure */
  data: T | null;
  /** True from the request until the current load settles, also while reloading */
  isLoading: boolean;
  /** The current load failed; `error` holds what was thrown */
  hasError: boolean;
  error: unknown;
  /** Loads again with the same loader; `data` stays visible until the new result arrives */
  reload: () => void;
  /** Applies a local change (after a delete or rename) without asking the server again */
  update: (change: (current: T) => T) => void;
}

/**
 * Loads data when the component mounts and whenever `load` changes. Memoize
 * `load` with useCallback over its inputs (an id, a page number): a new
 * function means a new request and the previous result is no longer shown.
 *
 * State is only set from the promise callbacks, never synchronously inside
 * the effect, so it follows `react-hooks/set-state-in-effect`.
 */
export function useAsyncData<T>(load: () => Promise<T>): AsyncData<T> {
  const [reloadCount, setReloadCount] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setSettled({ load, reloadCount, data, hasError: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSettled((previous) => ({
          load,
          reloadCount,
          data: previous && previous.load === load ? previous.data : null,
          hasError: true,
          error,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [load, reloadCount]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  const update = useCallback((change: (current: T) => T) => {
    setSettled((previous) => (previous && previous.data !== null ? { ...previous, data: change(previous.data) } : previous));
  }, []);

  const isCurrent = settled !== null && settled.load === load && settled.reloadCount === reloadCount;
  const hasData = settled !== null && settled.load === load;

  return {
    data: hasData ? settled.data : null,
    isLoading: !isCurrent,
    hasError: isCurrent && settled.hasError,
    error: isCurrent ? settled.error : null,
    reload,
    update,
  };
}

'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept up to date. `serverValue` is what the
 * server render and the first client render assume, so hydration matches.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  const getSnapshot = useCallback(
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : serverValue),
    [query, serverValue],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

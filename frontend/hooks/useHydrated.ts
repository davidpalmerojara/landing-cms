'use client';

import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

/**
 * False in the server HTML and until React has taken over the page, then true.
 * For controls that only work with JavaScript (a form sent by fetch): disabled
 * until then, so they never fall back to the browser's default behavior.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

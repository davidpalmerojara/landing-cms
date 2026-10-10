'use client';

import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

const readFlag = () => new URLSearchParams(window.location.search).get('guest') === 'expired';

/**
 * useAuth sends an expired guest to /login?guest=expired: true when the login
 * page was opened that way. False during server rendering, so the markup
 * matches before hydration.
 */
export function useGuestExpiredNotice(): boolean {
  return useSyncExternalStore(subscribeToNothing, readFlag, () => false);
}

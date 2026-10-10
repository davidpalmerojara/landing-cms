'use client';

import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

const readFlag = () => new URLSearchParams(window.location.search).get('deleted') === '1';

/**
 * After deleting an account the person lands on /?deleted=1: true when the
 * home page was opened that way, so it can say the deletion went through.
 * False during server rendering, so the markup matches before hydration.
 */
export function useAccountDeletedNotice(): boolean {
  return useSyncExternalStore(subscribeToNothing, readFlag, () => false);
}

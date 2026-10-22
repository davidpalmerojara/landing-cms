'use client';

import { useEffect, useState } from 'react';

/** After this long without an answer the free server is most likely waking up (DEPLOY-005). */
export const SLOW_REQUEST_MS = 4000;

/**
 * True once `pending` has lasted `delayMs`. The first request after the free
 * backend has been idle can take up to a minute, and a spinner alone looks
 * like a hang: callers show "waking up the server" while this is true.
 */
export function useSlowRequest(pending: boolean, delayMs: number = SLOW_REQUEST_MS): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending, delayMs]);

  return pending && slow;
}

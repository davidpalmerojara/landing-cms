'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

/** Pinged already in this page's life: moving between marketing pages does not repeat it. */
let warmed = false;

/**
 * Starts waking the free backend (it sleeps after 15 minutes idle and takes up
 * to a minute to answer) while the visitor reads the landing page, so it is
 * ready by the time they press "Try it" (DEPLOY-005, PERF-001).
 */
export function useServerWarmUp(): void {
  useEffect(() => {
    if (warmed) return;
    warmed = true;
    void api.health.warmUp();
  }, []);
}

/** Lets tests ping again. */
export function resetServerWarmUp(): void {
  warmed = false;
}

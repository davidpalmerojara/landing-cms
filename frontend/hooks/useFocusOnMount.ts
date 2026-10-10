'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Focuses a field when the page opens, but only where there is a physical
 * keyboard (a fine pointer). On a phone or tablet focusing a field opens the
 * on-screen keyboard over half the form before the person has read it.
 */
export function useFocusOnMount(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return;
    ref.current?.focus();
  }, [ref]);
}

'use client';

import { useEffect, type RefObject } from 'react';
import { FOCUSABLE_SELECTOR } from '@/lib/keyboard';

/**
 * Takes every focusable element inside `ref` out of the tab order and keeps
 * doing so as its content changes.
 *
 * Blocks on the editor canvas are previews: their buttons, links and form
 * fields do nothing there (pointer events are off) but would still be Tab
 * stops. The block itself is the keyboard target; its content is edited from
 * the inspector.
 */
export function useRemoveFromTabOrder(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;

    const apply = () => {
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((el) => {
        if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      });
    };

    apply();
    // Attribute changes are not observed, so setting tabindex cannot loop
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref, enabled]);
}

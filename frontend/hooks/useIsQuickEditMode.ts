'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { QUICK_EDIT_BREAKPOINT } from '@/lib/constants';

/**
 * Detects viewport width and updates `isQuickEditMode` in the store.
 * Returns the current value so the editor page can conditionally render.
 */
export function useIsQuickEditMode(): boolean {
  const isQuickEditMode = useEditorStore((s) => s.isQuickEditMode);
  const setIsQuickEditMode = useEditorStore((s) => s.setIsQuickEditMode);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${QUICK_EDIT_BREAKPOINT - 1}px)`);

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsQuickEditMode(e.matches);
    };

    // Set initial value
    handler(mql);

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setIsQuickEditMode]);

  return isQuickEditMode;
}

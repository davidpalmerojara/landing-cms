'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { QUICK_EDIT_MEDIA_QUERY } from '@/lib/constants';

/**
 * Whether this screen is a phone (QUICK_EDIT_MEDIA_QUERY: narrow, or a touch
 * screen held sideways) and updates `isQuickEditMode` in the store. Rotating
 * a phone keeps it in Quick Edit; tablets get the full editor.
 * Returns the current value so the editor page can conditionally render.
 */
export function useIsQuickEditMode(): boolean {
  const isQuickEditMode = useEditorStore((s) => s.isQuickEditMode);
  const setIsQuickEditMode = useEditorStore((s) => s.setIsQuickEditMode);

  useEffect(() => {
    const mql = window.matchMedia(QUICK_EDIT_MEDIA_QUERY);

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

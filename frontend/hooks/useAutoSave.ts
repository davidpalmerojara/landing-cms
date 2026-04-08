'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editor-store';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTO_SAVE_DELAY = 3000;

export function useAutoSave(saveToApi: () => Promise<boolean>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<SaveStatus>('idle');
  const cancelledRef = useRef(false);
  const setAutoSaveStatus = useCallback((status: SaveStatus) => {
    if (cancelledRef.current) return;
    statusRef.current = status;
    useEditorStore.setState({ autoSaveStatus: status });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    // Subscribe to page changes via zustand
    const unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        // Don't auto-save if page hasn't actually changed
        if (page === prevPage) return;

        // Don't auto-save local-only pages (not yet created in backend)
        if (page.id.startsWith('page_')) return;

        // Don't auto-save remote updates (received via WebSocket)
        if (useEditorStore.getState().isRemoteUpdate) return;

        // Clear existing timer
        if (timerRef.current) clearTimeout(timerRef.current);

        setAutoSaveStatus('idle');

        // Set new debounced save
        timerRef.current = setTimeout(async () => {
          if (cancelledRef.current) return;
          setAutoSaveStatus('saving');
          const ok = await saveToApi();
          if (cancelledRef.current) return;
          setAutoSaveStatus(ok ? 'saved' : 'error');

          // Reset status after 2s
          if (ok) {
            setTimeout(() => {
              if (cancelledRef.current) return;
              if (statusRef.current === 'saved') {
                setAutoSaveStatus('idle');
              }
            }, 2000);
          }
        }, AUTO_SAVE_DELAY);
      },
    );

    return () => {
      cancelledRef.current = true;
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saveToApi, setAutoSaveStatus]);
}

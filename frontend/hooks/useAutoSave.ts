'use client';

import { useEffect, useRef } from 'react';
import { countOtherConnections, useEditorStore } from '@/store/editor-store';
import { writeBackup } from '@/lib/page-backup';
import { registerSaveFlush } from '@/lib/save-flush';
import type { SaveOptions } from '@/lib/page-sync';

export const AUTO_SAVE_DELAY = 3000;
/** Shorter while someone else edits the page, so they see changes sooner and conflicts stay small. */
export const COLLAB_AUTO_SAVE_DELAY = 800;

/** Debounce for the next autosave: shorter while another socket (person or tab) is on the page. */
export function autoSaveDelay(otherConnections: number): number {
  return otherConnections > 0 ? COLLAB_AUTO_SAVE_DELAY : AUTO_SAVE_DELAY;
}

export interface AutoSaveLeaveHandlers {
  /** Send the pending change with keepalive while the tab closes; false when it could not be sent. */
  saveOnLeave?: () => boolean;
  /** The editor has changes the server does not have (a pending edit, a failed save, a refused field). */
  hasUnsavedChanges?: () => boolean;
}

const isAccessRevoked = () => useEditorStore.getState().collabStatus === 'revoked';

/**
 * Saves the page a few seconds after the last local edit, and makes sure an
 * edit is never left behind (QA-003): every edit is copied to the local backup
 * at once, and the pending save is sent right away when the editor unmounts,
 * the tab is hidden or closed, or someone calls `flushPendingSave()`. While a
 * change could not be sent (offline, refused), closing the tab asks first.
 * Status and errors are set by the sync controller (lib/page-sync).
 */
export function useAutoSave(
  saveToApi: (options?: SaveOptions) => Promise<boolean>,
  { saveOnLeave, hasUnsavedChanges }: AutoSaveLeaveHandlers = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = (): boolean => {
      const pending = timerRef.current !== null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return pending;
    };
    /** Something is waiting to reach the server; clears the debounce either way. */
    const takePending = (): boolean => {
      const pending = clearTimer();
      if (isAccessRevoked()) return false;
      return pending || (hasUnsavedChanges?.() ?? false);
    };

    const unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        // Local-only pages (not yet created in backend) are saved explicitly
        if (page.id.startsWith('page_')) return;
        // Remote updates (received via WebSocket or merged) are already on the server
        if (useEditorStore.getState().isRemoteUpdate) return;
        // Access was revoked: the server would refuse every save, so stop trying
        if (isAccessRevoked()) return;

        // The edit is kept in this browser before anything else can go wrong
        writeBackup(page, useEditorStore.getState().syncBase);

        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (isAccessRevoked()) return;
          void saveToApi();
        }, autoSaveDelay(countOtherConnections(useEditorStore.getState())));
      },
    );

    const unregisterFlush = registerSaveFlush(() => (takePending() ? saveToApi() : Promise.resolve(!isAccessRevoked())));

    const sendWhileLeaving = (): boolean => {
      if (!takePending()) return true;
      if (saveOnLeave) return saveOnLeave();
      void saveToApi({ keepalive: true });
      return true;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      // The tab may never come back (mobile browsers discard hidden tabs)
      if (takePending()) void saveToApi({ keepalive: true });
    };
    const onPageHide = () => { sendWhileLeaving(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const sent = sendWhileLeaving();
      const unsaved = useEditorStore.getState().saveIssue !== null && (hasUnsavedChanges?.() ?? true);
      if (!sent || unsaved) {
        // The browser asks "Leave site?"; the backup keeps the change either way
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      unsub();
      unregisterFlush();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Leaving the editor inside the app: the save goes on in the background
      if (takePending()) void saveToApi();
    };
  }, [saveToApi, saveOnLeave, hasUnsavedChanges]);
}

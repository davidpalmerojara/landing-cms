'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { api, ApiError } from '@/lib/api';
import { logSyncError, readBackup } from '@/lib/page-backup';
import { PageSyncController } from '@/lib/page-sync';
import type { PageSyncCallbacks, RemotePageChange } from '@/lib/page-sync';

export type { RemotePageChange } from '@/lib/page-sync';

/**
 * Loads the page and keeps it in sync with the server through one
 * PageSyncController per page (versioned saves, merges, remote changes).
 */
export function usePageSync(pageId?: string, callbacks: PageSyncCallbacks = {}) {
  const page = useEditorStore((s) => s.page);
  const loadedPageIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** The page could not be loaded */
  const [error, setError] = useState<string | null>(null);
  /** HTTP status of the failed load (404: the page does not exist or is not theirs); null for network errors */
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  /** The last save failed (the editor keeps working; shown in the top bar) */
  const [saveError, setSaveError] = useState<string | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // One controller per page; the callbacks are read when they fire
  const sync = useMemo(() => new PageSyncController(pageId ?? '', () => ({
    onRemoteMerged: (change) => callbacksRef.current.onRemoteMerged?.(change),
    onSaveFailed: (kind, e) => {
      // A conflict is not a connection problem: the autosave status and a toast explain it
      if (kind === 'request') setSaveError(e instanceof Error ? e.message : kind);
      callbacksRef.current.onSaveFailed?.(kind, e);
    },
  })), [pageId]);

  // Load page from API on mount or pageId change
  useEffect(() => {
    if (loadedPageIdRef.current === (pageId ?? '__no_page__')) return;
    loadedPageIdRef.current = pageId ?? '__no_page__';

    async function loadPage(controller: PageSyncController) {
      try {
        if (pageId) {
          await controller.load(() => api.pages.get(pageId));
        } else {
          // Load first available page, or keep the default page from the store
          const response = await api.pages.list();
          if (response.results.length > 0) {
            const firstId = response.results[0].id;
            await controller.load(() => api.pages.get(firstId));
          }
        }
      } catch (e) {
        logSyncError('Failed to load page from API, using local backup if any:', e);
        setError(e instanceof Error ? e.message : 'Error al cargar');
        setErrorStatus(e instanceof ApiError ? e.status : null);
        // Nothing known about the server's copy: the first save fetches it before sending
        useEditorStore.getState().setSyncBase(null);
        const backup = pageId ? readBackup(pageId) : null;
        if (backup) useEditorStore.getState().loadPage(backup);
      } finally {
        setIsLoading(false);
      }
    }

    loadPage(sync);
  }, [pageId, sync]);

  const saveToApi = useCallback(async () => {
    setSaveError(null);
    return sync.save();
  }, [sync]);

  const publishToApi = useCallback(async () => {
    return sync.publish();
  }, [sync]);

  /** Restore a version for everyone; rejects when the server refuses it. */
  const restoreVersion = useCallback(async (versionId: string) => {
    await sync.restoreVersion(versionId);
  }, [sync]);

  /** A version announced by the collaboration socket (page_updated, reconnect). */
  const handleRemoteChange = useCallback((change: RemotePageChange) => {
    void sync.handleRemoteChange(change);
  }, [sync]);

  return { isLoading, error, errorStatus, saveError, saveToApi, publishToApi, restoreVersion, handleRemoteChange, page };
}

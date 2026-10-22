'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { api, ApiError } from '@/lib/api';
import { apiErrorKind } from '@/lib/api-errors';
import type { ApiErrorKind } from '@/lib/api-errors';
import { allowBackup, discardBackup, logSyncError, readBackup } from '@/lib/page-backup';
import { PageSyncController } from '@/lib/page-sync';
import type { PageSyncCallbacks, RemotePageChange, SaveOptions } from '@/lib/page-sync';

export type { RemotePageChange } from '@/lib/page-sync';

/**
 * Loads the page and keeps it in sync with the server through one
 * PageSyncController per page (versioned saves, merges, remote changes).
 * Save status and problems live in the store (`autoSaveStatus`, `saveIssue`),
 * set by the controller on every save path.
 */
export function usePageSync(pageId?: string, callbacks: PageSyncCallbacks = {}) {
  const page = useEditorStore((s) => s.page);
  const loadedPageIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Why the page could not be loaded (never the server's text); null when it did */
  const [error, setError] = useState<ApiErrorKind | null>(null);
  /** Bumped by `retryLoad` to load the page again */
  const [loadAttempt, setLoadAttempt] = useState(0);
  /** HTTP status of the failed load (404: the page does not exist or is not theirs); null for network errors */
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // One controller per page; the callbacks are read when they fire
  const sync = useMemo(() => new PageSyncController(pageId ?? '', () => ({
    onRemoteMerged: (change) => callbacksRef.current.onRemoteMerged?.(change),
    onSaveFailed: (kind, e) => callbacksRef.current.onSaveFailed?.(kind, e),
    onLocalChangesRecovered: () => callbacksRef.current.onLocalChangesRecovered?.(),
  })), [pageId]);

  useEffect(() => {
    sync.start();
    return () => sync.dispose();
  }, [sync]);

  // Back online: send what failed instead of waiting for the next retry
  useEffect(() => {
    const retry = () => { void sync.retryNow(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [sync]);

  // Access removed: the copy kept in this browser is someone else's page now (QA-110)
  useEffect(() => useEditorStore.subscribe(
    (s) => s.collabStatus,
    (status) => {
      const id = pageId || useEditorStore.getState().page.id;
      if (status === 'revoked' && id) discardBackup(id);
    },
  ), [pageId]);

  // Load page from API on mount or pageId change
  useEffect(() => {
    const loadKey = `${pageId ?? '__no_page__'}:${loadAttempt}`;
    if (loadedPageIdRef.current === loadKey) return;
    loadedPageIdRef.current = loadKey;

    async function loadPage(controller: PageSyncController) {
      try {
        if (pageId) {
          await controller.load(() => api.pages.get(pageId));
          allowBackup(pageId);
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
        setError(apiErrorKind(e));
        setErrorStatus(e instanceof ApiError ? e.status : null);
        // The page is gone or no longer theirs: its copy must not reopen it
        const goneForGood = e instanceof ApiError && (e.status === 404 || e.status === 403);
        if (goneForGood && pageId) discardBackup(pageId);
        const backup = pageId && !goneForGood ? readBackup(pageId) : null;
        // The copy's base, if it has one, is what the next save is checked against; without it the first save fetches it
        useEditorStore.getState().setSyncBase(backup?.base ?? null);
        if (backup) useEditorStore.getState().loadPage(backup.page);
      } finally {
        setIsLoading(false);
      }
    }

    loadPage(sync);
  }, [pageId, sync, loadAttempt]);

  /** Try loading the page again after a failure (the server may have been asleep). */
  const retryLoad = useCallback(() => {
    setError(null);
    setErrorStatus(null);
    setIsLoading(true);
    setLoadAttempt((n) => n + 1);
  }, []);

  const saveToApi = useCallback((options?: SaveOptions) => sync.save(options), [sync]);

  /** The tab is closing: send what is pending with keepalive. False when it could not be sent. */
  const saveOnLeave = useCallback(() => sync.saveOnLeave(), [sync]);

  const hasUnsavedChanges = useCallback(() => sync.hasUnsavedChanges(), [sync]);

  const publishToApi = useCallback(() => sync.publish(), [sync]);

  const unpublishToApi = useCallback(() => sync.unpublish(), [sync]);

  /** Why the last publish or unpublish failed at the server (null: it did not, or the save before it failed). */
  const lastPublicationError = useCallback(() => sync.lastPublicationError, [sync]);

  /** Restore a version for everyone; rejects when the server refuses it. */
  const restoreVersion = useCallback(async (versionId: string) => {
    await sync.restoreVersion(versionId);
  }, [sync]);

  /** A version announced by the collaboration socket (page_updated, reconnect). */
  const handleRemoteChange = useCallback((change: RemotePageChange) => {
    void sync.handleRemoteChange(change);
  }, [sync]);

  return {
    isLoading,
    error,
    errorStatus,
    retryLoad,
    saveToApi,
    saveOnLeave,
    hasUnsavedChanges,
    publishToApi,
    unpublishToApi,
    lastPublicationError,
    restoreVersion,
    handleRemoteChange,
    page,
  };
}

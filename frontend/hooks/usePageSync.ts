'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import { isBlockId, newBlockId } from '@/lib/block-factory';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import type { Page } from '@/types/page';
import { defaultBlockStyles } from '@/types/blocks';
import type { ApiPage } from '@/lib/api';
import { apiPageToLocal, localPageToApi } from '@/lib/page-mapping';

const isDev = process.env.NODE_ENV === 'development';

function logSyncError(message: string, error: unknown) {
  // TODO: replace with centralized client-side error logging when available.
  if (isDev) {
    console.error(message, error);
  }
}

// --- Local backup (used only when the API is unreachable) ---

const backupKey = (pageId: string) => `paxl-page-backup:${pageId}`;

function writeBackup(page: Page) {
  try {
    localStorage.setItem(backupKey(page.id), JSON.stringify(page));
  } catch (e) {
    logSyncError('Could not write local page backup:', e);
  }
}

function readBackup(pageId: string): Page | null {
  try {
    const raw = localStorage.getItem(backupKey(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Page;
    if (parsed?.id !== pageId || !Array.isArray(parsed.blocks)) return null;
    return {
      ...parsed,
      // Backups written before design tokens were the only theme have none
      designTokens: parsed.designTokens ?? cloneDesignTokens(defaultDesignTokens),
      // Backups written before ADR-014 may hold non-UUID block ids
      blocks: parsed.blocks.map((b) => ({
        ...b,
        id: isBlockId(b.id) ? b.id : newBlockId(),
        styles: b.styles || { ...defaultBlockStyles },
      })),
    };
  } catch (e) {
    logSyncError('Could not read local page backup:', e);
    return null;
  }
}

/** Apply read-only publication fields from the server without an undo step or autosave. */
function applyPublication(apiPage: ApiPage) {
  const page = useEditorStore.getState().page;
  useEditorStore.setState({
    isRemoteUpdate: true,
    page: {
      ...page,
      status: apiPage.status,
      publishedAt: apiPage.published_at ?? null,
      hasUnpublishedChanges: apiPage.has_unpublished_changes ?? false,
    },
  });
  queueMicrotask(() => useEditorStore.setState({ isRemoteUpdate: false }));
}

// --- Hook ---

export function usePageSync(pageId?: string) {
  const page = useEditorStore((s) => s.page);
  const loadedPageIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load page from API on mount or pageId change
  useEffect(() => {
    if (loadedPageIdRef.current === (pageId ?? '__no_page__')) return;
    loadedPageIdRef.current = pageId ?? '__no_page__';

    async function loadPage() {
      try {
        if (pageId) {
          const apiPage = await api.pages.get(pageId);
          useEditorStore.getState().loadPage(apiPageToLocal(apiPage));
        } else {
          // Load first available page, or keep the default page from the store
          const response = await api.pages.list();
          if (response.results.length > 0) {
            const apiPage = await api.pages.get(response.results[0].id);
            useEditorStore.getState().loadPage(apiPageToLocal(apiPage));
          }
        }
      } catch (e) {
        logSyncError('Failed to load page from API, using local backup if any:', e);
        setError(e instanceof Error ? e.message : 'Error al cargar');
        const backup = pageId ? readBackup(pageId) : null;
        if (backup) useEditorStore.getState().loadPage(backup);
      } finally {
        setIsLoading(false);
      }
    }

    loadPage();
  }, [pageId]);

  // Save to API
  const saveToApi = useCallback(async () => {
    const currentPage = useEditorStore.getState().page;
    try {
      setError(null);
      const payload = localPageToApi(currentPage);

      if (currentPage.id.startsWith('page_')) {
        // Local-only page, create on backend — must update page with real ID
        const created = await api.pages.create(payload);
        useEditorStore.setState({
          page: apiPageToLocal(created),
          isSaved: true,
        });
      } else {
        // Block ids are generated client-side and kept by the server (ADR-014),
        // so the response needs no reconciliation with local state.
        const updated = await api.pages.update(currentPage.id, payload);
        const unchanged = useEditorStore.getState().page === currentPage;
        applyPublication(updated);
        if (unchanged) useEditorStore.setState({ isSaved: true });
      }

      writeBackup(useEditorStore.getState().page);
      return true;
    } catch (e) {
      logSyncError('Failed to save to API:', e);
      setError(e instanceof Error ? e.message : 'Error al guardar');
      writeBackup(currentPage);
      return false;
    }
  }, []);

  // Publish: save the draft, then freeze it as the public page
  const publishToApi = useCallback(async () => {
    if (useEditorStore.getState().page.id.startsWith('page_')) return false;
    const saved = await saveToApi();
    if (!saved) return false;
    try {
      const published = await api.pages.publish(useEditorStore.getState().page.id);
      applyPublication(published);
      return true;
    } catch (e) {
      logSyncError('Failed to publish:', e);
      setError(e instanceof Error ? e.message : 'Error al publicar');
      return false;
    }
  }, [saveToApi]);

  /** Replace the editor state with the server's copy (e.g. after restoring a version). */
  const reloadFromApi = useCallback(async () => {
    const current = useEditorStore.getState().page;
    const fresh = await api.pages.get(current.id);
    useEditorStore.getState().loadPage(apiPageToLocal(fresh));
  }, []);

  return { isLoading, error, saveToApi, publishToApi, reloadFromApi, page };
}

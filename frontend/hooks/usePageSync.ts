'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import { blockRegistry } from '@/lib/block-registry';
import { defaultBlockStyles } from '@/types/blocks';
import { isBlockId, newBlockId } from '@/lib/block-factory';
import type { Page } from '@/types/page';
import { defaultSeoFields } from '@/types/page';
import type { Block } from '@/types/blocks';
import type { ApiPage } from '@/lib/api';
import { apiToTokens, tokensToApi } from '@/lib/design-tokens';

const isDev = process.env.NODE_ENV === 'development';

function logSyncError(message: string, error: unknown) {
  // TODO: replace with centralized client-side error logging when available.
  if (isDev) {
    console.error(message, error);
  }
}

// --- Mappers ---

export function apiPageToLocal(apiPage: ApiPage): Page {
  return {
    id: apiPage.id,
    name: apiPage.name,
    status: apiPage.status,
    slug: apiPage.slug,
    themeId: apiPage.theme_id || 'default',
    customTheme: (apiPage.custom_theme as Page['customTheme']) || undefined,
    designTokens: apiToTokens(apiPage.design_tokens as Record<string, unknown> | undefined),
    seo: {
      seoTitle: apiPage.seo_title || '',
      seoDescription: apiPage.seo_description || '',
      seoCanonicalUrl: apiPage.seo_canonical_url || '',
      ogTitle: apiPage.og_title || '',
      ogDescription: apiPage.og_description || '',
      ogImage: apiPage.og_image || '',
      ogType: apiPage.og_type || 'website',
      noindex: apiPage.noindex ?? false,
    },
    blocks: apiPage.blocks.map((b): Block => {
      const { responsive, ...baseStyles } = b.styles as Record<string, unknown>;
      return {
        id: b.id,
        type: b.type,
        name: blockRegistry[b.type]?.label || b.type,
        data: b.data,
        styles: { ...defaultBlockStyles, ...baseStyles },
        responsiveStyles: (responsive as Block['responsiveStyles']) || undefined,
      };
    }),
  };
}

export function localPageToApi(page: Page) {
  const seo = page.seo || defaultSeoFields;
  return {
    name: page.name,
    status: page.status,
    theme_id: page.themeId || 'default',
    custom_theme: page.customTheme || {},
    design_tokens: page.designTokens ? tokensToApi(page.designTokens) : {},
    seo_title: seo.seoTitle,
    seo_description: seo.seoDescription,
    seo_canonical_url: seo.seoCanonicalUrl,
    og_title: seo.ogTitle,
    og_description: seo.ogDescription,
    og_image: seo.ogImage,
    og_type: seo.ogType,
    noindex: seo.noindex,
    blocks: page.blocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      data: b.data,
      styles: {
        ...b.styles,
        ...(b.responsiveStyles ? { responsive: b.responsiveStyles } : {}),
      },
    })),
  };
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

/** Marks the page as saved unless it changed while the request was in flight. */
function markSavedIfUnchanged(sentPage: Page) {
  if (useEditorStore.getState().page === sentPage) {
    useEditorStore.setState({ isSaved: true });
  }
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
        await api.pages.update(currentPage.id, payload);
        markSavedIfUnchanged(currentPage);
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

  // Publish
  const publishToApi = useCallback(async () => {
    const currentPage = useEditorStore.getState().page;
    try {
      setError(null);
      const payload = { ...localPageToApi(currentPage), status: 'published' };

      if (currentPage.id.startsWith('page_')) {
        const result = await api.pages.create(payload);
        useEditorStore.setState({
          page: apiPageToLocal(result),
          isSaved: true,
        });
      } else {
        await api.pages.update(currentPage.id, payload);
        // Reflect the new status locally without adding an undo step
        const latestPage = useEditorStore.getState().page;
        useEditorStore.setState({
          isRemoteUpdate: true,
          page: { ...latestPage, status: 'published' },
          isSaved: latestPage === currentPage,
        });
        queueMicrotask(() => useEditorStore.setState({ isRemoteUpdate: false }));
      }
      return true;
    } catch (e) {
      logSyncError('Failed to publish:', e);
      setError(e instanceof Error ? e.message : 'Error al publicar');
      return false;
    }
  }, []);

  /** Replace the editor state with the server's copy (e.g. after restoring a version). */
  const reloadFromApi = useCallback(async () => {
    const current = useEditorStore.getState().page;
    const fresh = await api.pages.get(current.id);
    useEditorStore.getState().loadPage(apiPageToLocal(fresh));
  }, []);

  return { isLoading, error, saveToApi, publishToApi, reloadFromApi, page };
}

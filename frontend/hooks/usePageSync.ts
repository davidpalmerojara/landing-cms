'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import { blockRegistry } from '@/lib/block-registry';
import { defaultBlockStyles } from '@/types/blocks';
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

function apiPageToLocal(apiPage: ApiPage): Page {
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

function localPageToApi(page: Page) {
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

// --- Sync block IDs from API response ---

function syncBlockIdsFromApi(updated: ApiPage) {
  const localPage = useEditorStore.getState().page;
  const selectedBlockId = useEditorStore.getState().selectedBlockId;
  let newSelectedBlockId = selectedBlockId;

  // Sort API blocks by order to match frontend array order
  const sortedApiBlocks = [...updated.blocks].sort((a, b) => a.order - b.order);

  const syncedBlocks = localPage.blocks.map((b, i) => {
    const apiBlock = sortedApiBlocks[i];
    if (apiBlock && b.id !== apiBlock.id) {
      if (selectedBlockId === b.id) {
        newSelectedBlockId = apiBlock.id;
      }
      return { ...b, id: apiBlock.id };
    }
    return b;
  });
  const needsSync = syncedBlocks.some((b, i) => b !== localPage.blocks[i]);
  if (needsSync) {
    useEditorStore.setState({ isRemoteUpdate: true });
    useEditorStore.setState({
      page: { ...localPage, blocks: syncedBlocks },
      selectedBlockId: newSelectedBlockId,
      isSaved: true,
    });
    queueMicrotask(() => useEditorStore.setState({ isRemoteUpdate: false }));
  } else {
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
          // Load specific page
          const apiPage = await api.pages.get(pageId);
          useEditorStore.setState({ page: apiPageToLocal(apiPage) });
        } else {
          // Load first available page, or use default
          const response = await api.pages.list();
          if (response.results.length > 0) {
            const apiPage = await api.pages.get(response.results[0].id);
            useEditorStore.setState({ page: apiPageToLocal(apiPage) });
          }
          // If no pages exist, keep the default page from the store
        }
      } catch (e) {
        logSyncError('Failed to load page from API, using local state:', e);
        setError(e instanceof Error ? e.message : 'Error al cargar');
        // Fall back to localStorage if available
        try {
          const saved = localStorage.getItem('landing_builder_page');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.blocks) {
              parsed.blocks = parsed.blocks.map((b: Record<string, unknown>) => ({
                ...b,
                styles: b.styles || { ...defaultBlockStyles },
              }));
              useEditorStore.setState({ page: parsed });
            }
          }
        } catch {
          // Ignore localStorage errors
        }
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
        // Existing page, update
        const updated = await api.pages.update(currentPage.id, payload);
        // Sync block IDs from backend (new blocks get real UUIDs)
        syncBlockIdsFromApi(updated);
      }

      // Also keep localStorage as backup
      localStorage.setItem('landing_builder_page', JSON.stringify(useEditorStore.getState().page));

      return true;
    } catch (e) {
      logSyncError('Failed to save to API:', e);
      setError(e instanceof Error ? e.message : 'Error al guardar');
      // Fallback: save to localStorage
      localStorage.setItem('landing_builder_page', JSON.stringify(currentPage));
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
        const updated = await api.pages.update(currentPage.id, payload);
        // Sync block IDs and update status
        syncBlockIdsFromApi(updated);
        // Ensure status is updated locally
        const latestPage = useEditorStore.getState().page;
        if (latestPage.status !== 'published') {
          useEditorStore.setState({
            page: { ...latestPage, status: 'published' },
          });
        }
      }
      return true;
    } catch (e) {
      logSyncError('Failed to publish:', e);
      setError(e instanceof Error ? e.message : 'Error al publicar');
      return false;
    }
  }, []);

  return { isLoading, error, saveToApi, publishToApi, page };
}

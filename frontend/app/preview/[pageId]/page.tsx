'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { blockRegistry } from '@/lib/block-registry';
import { defaultBlockStyles, resolveStyles } from '@/types/blocks';
import type { Page } from '@/types/page';
import { defaultSeoFields } from '@/types/page';
import type { Block } from '@/types/blocks';
import { api } from '@/lib/api';
import type { ApiPage } from '@/lib/api';
import { getThemeById } from '@/lib/themes';
import { apiToTokens, defaultDesignTokens, tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

function getDeviceModeSnapshot(): DeviceMode {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function subscribeToViewport(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

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
    blocks: apiPage.blocks.map((b): Block => ({
      id: b.id,
      type: b.type,
      name: blockRegistry[b.type]?.label || b.type,
      data: b.data,
      styles: { ...defaultBlockStyles, ...b.styles },
    })),
  };
}

function PreviewTopBar({ page, onPublish, publishError }: { page: Page; onPublish: () => Promise<void>; publishError: string | null }) {
  const t = useTranslations();
  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  }, [onPublish]);

  return (
    <div className="sticky top-0 z-50 h-12 bg-surface border-b border-subtle/80 flex items-center justify-between px-2 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <a
          href={`/editor/${page.id}`}
          className="text-[12px] text-muted hover:text-primary transition-colors flex items-center gap-1.5 shrink-0"
        >
          &larr; <span className="hidden sm:inline">{t('preview.backToEditor')}</span>
        </a>
        <div className="w-px h-5 bg-surface-card hidden sm:block" />
        <span className="text-[12px] text-muted truncate hidden sm:block">{page.name}</span>
        <span
          className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-widest border shrink-0 ${
            page.status === 'published'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-surface-card border-default text-muted'
          }`}
        >
          {page.status === 'published' ? t('common.published') : t('common.draft')}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {publishError && (
          <span className="text-xs text-red-400 hidden sm:block">{publishError}</span>
        )}
        <button
          onClick={handlePublish}
          disabled={isPublishing}
          className="text-white font-bold text-sm px-4 py-1.5 rounded-md shadow-lg shadow-[#2563EB]/20 transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
        >
          {isPublishing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('preview.publishing')}
            </span>
          ) : (
            t('preview.publish')
          )}
        </button>
      </div>
    </div>
  );
}

export default function PreviewPage() {
  const t = useTranslations();
  const params = useParams();
  const pageId = params.pageId as string;
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const deviceMode = useSyncExternalStore<DeviceMode>(
    subscribeToViewport,
    getDeviceModeSnapshot,
    () => 'desktop',
  );

  useEffect(() => {
    async function loadPage() {
      try {
        const apiPage = await api.pages.get(pageId);
        setPage(apiPageToLocal(apiPage));
      } catch {
        setError(t('preview.notFound', { id: pageId }));
      }
    }
    loadPage();
  }, [pageId, t]);

  const handlePublish = useCallback(async () => {
    if (!page) return;
    setPublishError(null);
    try {
      const updated = await api.pages.update(page.id, { status: 'published' });
      setPage(apiPageToLocal(updated));
    } catch {
      setPublishError(t('preview.publishError'));
    }
  }, [page, t]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-primary">
        <div className="text-center space-y-4">
          <p className="text-xl font-semibold">{error}</p>
          <a href="/dashboard" className="text-primary-color hover:underline text-sm">
            {t('common.backToDashboard')}
          </a>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">{t('preview.loading')}</span>
        </div>
      </div>
    );
  }

  const theme = getThemeById(page.themeId || 'default', page.customTheme);
  const designTokens = page.designTokens || defaultDesignTokens;
  const bpVars = tokensToCssVars(designTokens);
  const legacyVars = page.designTokens ? tokensToThemeVars(designTokens) : {
    '--theme-primary': theme.colors.primary,
    '--theme-primary-hover': theme.colors.primaryHover,
    '--theme-secondary': theme.colors.secondary,
    '--theme-bg': theme.colors.background,
    '--theme-surface': theme.colors.surface,
    '--theme-text': theme.colors.text,
    '--theme-text-muted': theme.colors.textMuted,
    '--theme-border': theme.colors.border,
    '--theme-accent': theme.colors.accent,
  };
  const themeVars = { ...bpVars, ...legacyVars } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-white" style={themeVars}>
      <PreviewTopBar page={page} onPublish={handlePublish} publishError={publishError} />

      {page.blocks.map((block) => {
        const BlockComponent = blockRegistry[block.type]?.component;
        if (!BlockComponent) return null;

        const s = resolveStyles(block, deviceMode);
        const blockStyle: React.CSSProperties = block.type !== 'navbar' ? { overflow: 'hidden' } : {};
        if (s.paddingTop) blockStyle.paddingTop = s.paddingTop;
        if (s.paddingBottom) blockStyle.paddingBottom = s.paddingBottom;
        if (s.paddingLeft) blockStyle.paddingLeft = s.paddingLeft;
        if (s.paddingRight) blockStyle.paddingRight = s.paddingRight;
        if (s.marginTop) blockStyle.marginTop = s.marginTop;
        if (s.marginBottom) blockStyle.marginBottom = s.marginBottom;
        if (s.bgColor) {
          blockStyle.backgroundColor = s.bgColor;
          (blockStyle as Record<string, unknown>)['--theme-bg'] = s.bgColor;
        }
        if (s.borderRadius) blockStyle.borderRadius = s.borderRadius;

        return (
          <div key={block.id} style={blockStyle}>
            <BlockComponent
              blockId={block.id}
              data={block.data}
              isMobile={deviceMode === 'mobile'}
              isTablet={deviceMode === 'tablet'}
              isPreviewMode={true}
            />
          </div>
        );
      })}

      {page.blocks.length === 0 && (
        <div className="flex items-center justify-center min-h-screen text-muted">
          <div className="text-center space-y-4">
            <p className="text-xl">{t('preview.empty')}</p>
            <a href={`/editor/${page.id}`} className="text-primary-color hover:underline text-sm">
              {t('preview.backToEditor')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

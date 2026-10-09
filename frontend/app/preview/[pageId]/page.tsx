'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Page } from '@/types/page';
import { api } from '@/lib/api';
import { apiPageToLocal } from '@/lib/page-mapping';
import { pageThemeVars } from '@/lib/page-theme';
import PageRenderer from '@/components/renderer/PageRenderer';

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
          className="text-white font-bold text-sm px-4 py-1.5 rounded-md shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
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
      // Freezes the saved draft shown here as the public page (ADR-017)
      const published = await api.pages.publish(page.id);
      setPage(apiPageToLocal(published));
    } catch (e) {
      setPublishError(t('preview.publishError'));
      if (process.env.NODE_ENV === 'development') console.error('Failed to publish from preview:', e);
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

  const themeVars = pageThemeVars({ themeId: page.themeId, customTheme: page.customTheme, designTokens: page.designTokens });

  return (
    <div className="min-h-screen bg-white">
      <PreviewTopBar page={page} onPublish={handlePublish} publishError={publishError} />

      {page.blocks.length > 0 ? (
        <PageRenderer blocks={page.blocks} themeVars={themeVars} liveLinks />
      ) : (
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Page } from '@/types/page';
import { api } from '@/lib/api';
import { apiPageToLocal } from '@/lib/page-mapping';
import { pageThemeVars } from '@/lib/page-theme';
import PageRenderer from '@/components/renderer/PageRenderer';
import { publishNotice } from '@/lib/publish-checks';

interface PreviewTopBarProps {
  page: Page;
  onPublish: () => Promise<void>;
  publishError: string | null;
  /** Set after a publish from here: where the page now is, and anything worth knowing (QA-098) */
  published: { path: string; notice: string | null } | null;
}

function PreviewTopBar({ page, onPublish, publishError, published }: PreviewTopBarProps) {
  const t = useTranslations();
  const [isPublishing, setIsPublishing] = useState(false);
  // Publishing is the owner's (D1, ADR-032): a collaborator is told so instead of getting a button that fails (PUBLIC2-001)
  const isOwner = page.isOwner !== false;
  const isPublished = page.status === 'published';
  const isUpToDate = isPublished && !page.hasUnpublishedChanges;

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
        <Link
          href={`/editor/${page.id}`}
          aria-label={t('preview.backToEditor')}
          className="min-h-11 min-w-11 text-[12px] text-muted hover:text-primary transition-colors flex items-center gap-1.5 shrink-0"
        >
          <span aria-hidden="true">&larr;</span> <span className="hidden sm:inline">{t('preview.backToEditor')}</span>
        </Link>
        <div className="w-px h-5 bg-surface-card hidden sm:block" />
        <span className="text-[12px] text-muted truncate hidden sm:block">{page.name}</span>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border shrink-0 ${
            page.status === 'published'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-success'
              : 'bg-surface-card border-default text-muted'
          }`}
        >
          {page.status === 'published' ? t('common.published') : t('common.draft')}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div role="status" className="min-w-0 text-xs">
          {publishError && <span className="text-error">{publishError}</span>}
          {published && (
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-success shrink-0">{t('preview.published')}</span>
              <a href={published.path} target="_blank" rel="noopener" className="text-primary-color underline truncate">
                {published.path}
                <span className="sr-only"> {t('publishing.opensInNewTab')}</span>
              </a>
            </span>
          )}
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || isUpToDate}
            className="shrink-0 min-h-11 text-white font-bold text-sm px-4 rounded-md shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            {isPublishing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                {t('preview.publishing')}
              </span>
            ) : (
              t(isUpToDate ? 'preview.upToDate' : isPublished ? 'preview.republish' : 'preview.publish')
            )}
          </button>
        ) : (
          <p className="min-w-0 max-w-[16rem] text-xs leading-snug text-muted">{t('publishing.ownerOnly')}</p>
        )}
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
  const [published, setPublished] = useState<PreviewTopBarProps['published']>(null);

  // The tab says which page this is, not just "Paxl" (QA-085)
  useEffect(() => {
    if (page) document.title = t('preview.documentTitle', { name: page.name });
    else if (error) document.title = `${t('errors.notFoundTitle')} — ${t('common.brand')}`;
  }, [page, error, t]);

  // <html lang> stays the interface language (the bar is Paxl's); the page's own area declares the page's
  // language through PageRenderer (PUBLIC2-006)

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
    setPublished(null);
    try {
      // Freezes the saved draft shown here as the public page (ADR-017)
      const result = apiPageToLocal(await api.pages.publish(page.id));
      setPage(result);
      setPublished({ path: `/p/${result.slug}`, notice: publishNotice(result.blocks, t) });
    } catch (e) {
      setPublishError(t('preview.publishError'));
      if (process.env.NODE_ENV === 'development') console.error('Failed to publish from preview:', e);
    }
  }, [page, t]);

  if (error) {
    return (
      <main id="main-content" tabIndex={-1} className="flex items-center justify-center min-h-screen px-6 bg-surface text-primary outline-none">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">{error}</h1>
          <a href="/dashboard" className="text-primary-color hover:underline text-sm">
            {t('common.backToDashboard')}
          </a>
        </div>
      </main>
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

  const themeVars = pageThemeVars(page.designTokens);

  return (
    <div className="min-h-screen bg-white">
      <PreviewTopBar page={page} onPublish={handlePublish} publishError={publishError} published={published} />
      {published?.notice && (
        <p role="note" className="m-0 px-4 py-2 text-center text-sm bg-amber-100 text-amber-900 border-b border-amber-300">
          {published.notice}
        </p>
      )}

      {page.blocks.length > 0 ? (
        <PageRenderer blocks={page.blocks} themeVars={themeVars} language={page.seo.language} liveLinks />
      ) : (
        <main id="main-content" tabIndex={-1} className="flex items-center justify-center min-h-screen text-[#4B5563] outline-none">
          <div className="text-center space-y-4">
            <p className="text-xl">{t('preview.empty')}</p>
            <a href={`/editor/${page.id}`} className="text-[#1D4ED8] hover:underline text-sm">
              {t('preview.backToEditor')}
            </a>
          </div>
        </main>
      )}
    </div>
  );
}

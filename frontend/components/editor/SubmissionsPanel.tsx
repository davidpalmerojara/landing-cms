'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Loader2, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useSubmissions } from '@/hooks/useSubmissions';
import { useEditorStore } from '@/store/editor-store';
import type { ApiFormSubmission } from '@/lib/api';

interface SubmissionsPanelProps {
  pageId: string;
}

export default function SubmissionsPanel({ pageId }: SubmissionsPanelProps) {
  const t = useTranslations('submissions');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const addToast = useEditorStore((s) => s.addToast);
  const {
    submissions, count, page, totalPages, hasPrevious, hasNext,
    isLoading, hasError, goToPage, reload, remove,
  } = useSubmissions(pageId);
  const [pendingDelete, setPendingDelete] = useState<ApiFormSubmission | null>(null);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const ok = await remove(target.id);
    addToast(ok ? t('deleted') : t('deleteError'), ok ? 'success' : 'error');
  };

  return (
    <section aria-labelledby="submissions-title" className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 id="submissions-title" className="text-xl font-bold text-primary">{t('title')}</h1>
          <p className="text-sm text-muted">{t('description')}</p>
        </header>

        {isLoading && submissions.length === 0 && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {tCommon('loading')}
          </div>
        )}

        {hasError && (
          <div role="alert" className="flex items-center justify-between gap-3 bg-surface-elevated border border-error/30 rounded-xl p-4">
            <p className="text-sm text-error">{t('loadError')}</p>
            <button
              type="button"
              onClick={reload}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-surface-card hover:bg-surface-card/70 transition-colors"
            >
              {tCommon('retry')}
            </button>
          </div>
        )}

        {!isLoading && !hasError && count === 0 && (
          <div className="flex flex-col items-center text-center gap-3 bg-surface-elevated border border-subtle rounded-xl px-6 py-12">
            <div className="w-12 h-12 rounded-full bg-surface-card flex items-center justify-center">
              <Inbox className="w-6 h-6 text-muted" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-primary">{t('emptyTitle')}</h2>
            <p className="text-sm text-muted max-w-sm">{t('emptyDescription')}</p>
          </div>
        )}

        {submissions.length > 0 && (
          <>
            <p className="text-xs text-muted">{t('count', { count })}</p>
            <ul className="space-y-3" aria-label={t('listLabel')}>
              {submissions.map((submission) => (
                <li key={submission.id}>
                  <article className="bg-surface-elevated border border-subtle rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-primary truncate">{submission.name}</h2>
                        <a
                          href={`mailto:${submission.email}`}
                          className="text-sm text-primary-color hover:underline break-all"
                        >
                          {submission.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <time dateTime={submission.created_at} className="text-xs text-muted">
                          {formatDate(submission.created_at)}
                        </time>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(submission)}
                          aria-label={t('deleteLabel', { name: submission.name })}
                          className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-secondary whitespace-pre-wrap break-words">{submission.message}</p>
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}

        {totalPages > 1 && (
          <nav aria-label={t('pagination')} className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={!hasPrevious}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-secondary bg-surface-card hover:bg-surface-card/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              {t('previous')}
            </button>
            <span className="text-xs text-muted">{t('pageOf', { page, total: totalPages })}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={!hasNext}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-secondary bg-surface-card hover:bg-surface-card/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {tCommon('next')}
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('deleteTitle')}
        message={t('deleteMessage', { name: pendingDelete?.name ?? '' })}
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

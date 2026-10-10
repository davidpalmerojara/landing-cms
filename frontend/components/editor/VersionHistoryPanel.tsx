'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  X, History, Clock, Globe, RotateCcw, Sparkles, Save,
  Loader2, Pencil, Check, Trash2, ChevronDown, Crown, AlertCircle, RefreshCw, Info,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { ApiPageVersion } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { useVersionHistory, publishedVersionId } from '@/hooks/useVersionHistory';
import { useEditorStore } from '@/store/editor-store';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface VersionHistoryPanelProps {
  pageId: string;
  onClose: () => void;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
}

type PendingAction =
  | { kind: 'delete'; version: ApiPageVersion }
  | { kind: 'restore'; version: ApiPageVersion };

const TRIGGER_CONFIG: Record<string, { icon: typeof Clock; labelKey: string; color: string }> = {
  manual: { icon: Save, labelKey: 'triggerManual', color: 'bg-primary/20 text-primary-color border-primary/30' },
  auto_publish: { icon: Globe, labelKey: 'triggerAutoPublish', color: 'bg-emerald-500/20 text-success border-emerald-500/30' },
  auto_restore: { icon: RotateCcw, labelKey: 'triggerAutoRestore', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  auto_ai_generation: { icon: Sparkles, labelKey: 'triggerAutoAi', color: 'bg-amber-500/20 text-warning border-amber-500/30' },
};

/** Small buttons of a version card: 44 px on touch screens. */
const ACTION_CLASS = 'rounded transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 flex items-center justify-center';

function formatRelativeTime(dateStr: string, locale: string, t: ReturnType<typeof useTranslations<'versionHistory'>>): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return t('now');
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  if (diffH < 24) return t('hoursAgo', { count: diffH });
  if (diffD === 1) {
    return t('yesterdayAt', {
      time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    });
  }
  if (diffD < 7) return t('daysAgo', { count: diffD });
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes: number, locale: string): string {
  const decimalFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimalFormatter.format(bytes / 1024)} KB`;
  return `${decimalFormatter.format(bytes / (1024 * 1024))} MB`;
}

export default function VersionHistoryPanel({ pageId, onClose, onPreview, onRestore }: VersionHistoryPanelProps) {
  const t = useTranslations('versionHistory');
  const tRoot = useTranslations();
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const {
    versions, hasMore, isLoading: loading, isLoadingMore: loadingMore, loadMoreFailed, isPlanLimited,
    hasLoadError, loadError, maxVersions, reload, loadMore, updateVersions,
  } = useVersionHistory(pageId);
  // Collaborators can create and restore versions, not delete them (ADR-032)
  const isOwner = useEditorStore((s) => s.page.isOwner !== false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const askOriginRef = useRef<HTMLElement | null>(null);

  const [failedAction, setActionError] = useState<string | null>(null);
  const actionError = failedAction ?? (loadMoreFailed ? t('loadMoreError') : null);
  const protectedVersionId = publishedVersionId(versions);

  const handleUpdateLabel = async (versionId: string) => {
    setActionError(null);
    try {
      const updated = await api.versions.updateLabel(pageId, versionId, editLabel);
      updateVersions((prev) => prev.map((v) => (v.id === versionId ? { ...v, label: updated.label } : v)));
    } catch (e) {
      setActionError(apiErrorMessage(e, tRoot, 'versionHistory.updateLabelError'));
    }
    setEditingId(null);
  };

  const deleteVersion = async (versionId: string) => {
    setActionError(null);
    try {
      await api.versions.delete(pageId, versionId);
      updateVersions((prev) => prev.filter((v) => v.id !== versionId));
    } catch (e) {
      const isPublished = e instanceof ApiError && e.code === 'PUBLISHED_VERSION';
      setActionError(isPublished ? t('deletePublishedError') : apiErrorMessage(e, tRoot, 'versionHistory.deleteError'));
    }
  };

  /** Asks before deleting or restoring; Cancel returns focus to the button that asked. */
  const ask = (action: PendingAction, origin: HTMLElement) => {
    askOriginRef.current = origin;
    setPending(action);
  };

  const cancelPending = () => {
    setPending(null);
    askOriginRef.current?.focus();
  };

  const confirmPending = () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === 'delete') void deleteVersion(action.version.id);
    else onRestore(action.version.id);
  };

  const startEditing = (version: ApiPageVersion) => {
    setEditingId(version.id);
    setEditLabel(version.label);
  };

  return (
    // Below xl it opens over the canvas, like the inspector it replaces
    <aside
      aria-label={t('title')}
      className="w-64 lg:w-72 xl:w-80 bg-surface border-l border-surface-elevated/80 flex flex-col h-full shrink-0 overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:max-w-[85%] max-xl:shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-elevated/80 shrink-0">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="w-4 h-4 text-secondary" />
          <h2 className="text-sm font-medium text-primary">{t('title')}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className={`${ACTION_CLASS} text-muted hover:text-secondary p-1 hover:bg-surface-card/50`}
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {/* Error feedback */}
      {actionError && (
        <div role="alert" className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-error">
          {actionError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 aria-hidden="true" className="w-5 h-5 text-muted animate-spin" />
            <span className="sr-only">{tCommon('loading')}</span>
          </div>
        ) : hasLoadError ? (
          // A failed load is not an empty history (QA-047)
          <div role="alert" className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <AlertCircle aria-hidden="true" className="w-6 h-6 text-error mb-3" />
            <p className="text-sm text-secondary mb-1">{t('loadErrorTitle')}</p>
            <p className="text-xs text-muted mb-4">{apiErrorMessage(loadError, tRoot, 'versionHistory.loadError')}</p>
            <button
              type="button"
              onClick={reload}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-color hover:text-primary-color/80 px-3 py-1.5 pointer-coarse:min-h-11 rounded hover:bg-surface-card/50 transition-colors"
            >
              <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" /> {tCommon('retry')}
            </button>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-card flex items-center justify-center mb-3">
              <History aria-hidden="true" className="w-6 h-6 text-muted" />
            </div>
            <p className="text-sm text-secondary mb-1">{t('emptyTitle')}</p>
            <p className="text-xs text-muted">{t('emptyDescription')}</p>
          </div>
        ) : (
          <div className="relative px-4 py-3">
            {/* How many the plan keeps: older ones go when new ones are saved (QA-086) */}
            {maxVersions !== null && maxVersions > 0 && (
              <p className="mb-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted bg-surface-card/60 border border-subtle/60 rounded-lg px-3 py-2">
                <Info aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t('planLimitNote', { count: maxVersions })}
              </p>
            )}

            {/* Timeline line */}
            <div className="absolute left-[29px] top-6 bottom-6 w-px bg-surface-card" />

            <ul className="space-y-1">
              {versions.map((version, idx) => {
                const config = TRIGGER_CONFIG[version.trigger] || TRIGGER_CONFIG.manual;
                const Icon = config.icon;
                const isEditing = editingId === version.id;
                const isFirst = idx === 0;
                const canDelete = isOwner && versions.length > 1 && version.id !== protectedVersionId;

                return (
                  <li key={version.id} className="relative group">
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-3 w-[14px] h-[14px] rounded-full border-2 z-10 ${
                      isFirst
                        ? 'bg-primary border-primary'
                        : 'bg-surface-card border-default group-hover:border-default'
                    }`} />

                    {/* Card */}
                    <div className="ml-6 bg-surface-elevated/50 hover:bg-surface-elevated border border-subtle/60 hover:border-default/80 rounded-lg p-3 transition-colors">
                      {/* Top row: version number + trigger badge */}
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className="text-xs font-semibold text-primary">
                          v{version.version_number}
                        </h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${config.color}`}>
                          <Icon aria-hidden="true" className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                          {version.id === protectedVersionId ? t('publishedBadge') : t(config.labelKey)}
                        </span>
                      </div>

                      {/* Label (editable) */}
                      {isEditing ? (
                        <div className="flex items-center gap-1 mb-1.5">
                          <input
                            autoFocus
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleUpdateLabel(version.id);
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingId(null);
                              }
                            }}
                            aria-label={t('labelInput', { number: version.version_number })}
                            className="flex-1 min-w-0 bg-surface-card text-xs text-primary px-2 py-1 pointer-coarse:min-h-11 rounded border border-default outline-none focus:border-primary"
                          />
                          <button type="button" onClick={() => void handleUpdateLabel(version.id)} aria-label={tCommon('save')} className={`${ACTION_CLASS} text-success hover:text-emerald-300 p-0.5`}>
                            <Check aria-hidden="true" className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} aria-label={tCommon('cancel')} className={`${ACTION_CLASS} text-muted hover:text-secondary p-0.5`}>
                            <X aria-hidden="true" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : version.label ? (
                        <p
                          className="text-xs text-secondary mb-1.5 cursor-pointer hover:text-primary"
                          onDoubleClick={() => startEditing(version)}
                          title={t('editHint')}
                        >
                          {version.label}
                        </p>
                      ) : null}

                      {/* Meta row */}
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span className="flex items-center gap-1">
                          <Clock aria-hidden="true" className="w-3 h-3" />
                          {formatRelativeTime(version.created_at, locale, t)}
                        </span>
                        {version.created_by_name && (
                          <span>{version.created_by_name}</span>
                        )}
                        <span>{formatBytes(version.size_bytes, locale)}</span>
                      </div>

                      {/* Actions: shown on hover and keyboard focus, always on touch screens (QA-047) */}
                      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onPreview(version.id)}
                          aria-label={t('previewVersion', { number: version.version_number })}
                          className={`${ACTION_CLASS} text-[10px] text-secondary hover:text-primary bg-surface-card hover:bg-default px-2 py-1`}
                        >
                          {t('preview')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => ask({ kind: 'restore', version }, e.currentTarget)}
                          aria-label={t('restoreVersion', { number: version.version_number })}
                          className={`${ACTION_CLASS} text-[10px] text-primary-color hover:text-primary-color/80 bg-primary/10 hover:bg-primary/20 px-2 py-1`}
                        >
                          {t('restore')}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(version)}
                          aria-label={t('editLabelOf', { number: version.version_number })}
                          className={`${ACTION_CLASS} text-muted hover:text-secondary p-1 hover:bg-surface-card`}
                          title={t('editLabel')}
                        >
                          <Pencil aria-hidden="true" className="w-3 h-3" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => ask({ kind: 'delete', version }, e.currentTarget)}
                            aria-label={t('deleteVersionOf', { number: version.version_number })}
                            className={`${ACTION_CLASS} text-muted hover:text-red-400 p-1 hover:bg-surface-card`}
                            title={t('deleteVersion')}
                          >
                            <Trash2 aria-hidden="true" className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-3">
                <button
                  type="button"
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                  className="flex items-center gap-1 text-xs text-muted hover:text-secondary px-3 py-1.5 pointer-coarse:min-h-11 rounded hover:bg-surface-card/50 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="w-3.5 h-3.5" />
                  )}
                  {t('loadMore')}
                </button>
              </div>
            )}

            {/* Plan limit notice */}
            {isPlanLimited && (
              <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <Crown aria-hidden="true" className="w-4 h-4 text-warning shrink-0" />
                <p className="text-[11px] text-warning">
                  {t('upgradeNotice')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'delete' ? t('deleteTitle') : t('restoreTitle', { number: pending?.version.version_number ?? 0 })}
        message={pending?.kind === 'delete'
          ? t('deleteConfirm')
          : t('restoreConfirm', { number: pending?.version.version_number ?? 0 })}
        confirmLabel={pending?.kind === 'delete' ? tCommon('delete') : t('restore')}
        variant={pending?.kind === 'delete' ? 'danger' : 'default'}
        onConfirm={confirmPending}
        onCancel={cancelPending}
      />
    </aside>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  X, History, Clock, Globe, RotateCcw, Sparkles, Save,
  Loader2, Pencil, Check, Trash2, ChevronDown, Crown,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiPageVersion } from '@/lib/api';

interface VersionHistoryPanelProps {
  pageId: string;
  onClose: () => void;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
}

const TRIGGER_CONFIG: Record<string, { icon: typeof Clock; labelKey: string; color: string }> = {
  manual: { icon: Save, labelKey: 'triggerManual', color: 'bg-primary\/20 text-primary-color border-[#2563EB]/30' },
  auto_publish: { icon: Globe, labelKey: 'triggerAutoPublish', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  auto_restore: { icon: RotateCcw, labelKey: 'triggerAutoRestore', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  auto_ai_generation: { icon: Sparkles, labelKey: 'triggerAutoAi', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

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
  const locale = useLocale();
  const [versions, setVersions] = useState<ApiPageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [isPlanLimited, setIsPlanLimited] = useState(false);

  const fetchVersions = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.versions.list(pageId, page);
      setVersions((prev) => (append ? [...prev, ...res.results] : res.results));
      setHasMore(res.next !== null);
      setCurrentPage(page);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('403') && msg.includes('plan_limit')) {
        setIsPlanLimited(true);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [pageId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const [actionError, setActionError] = useState<string | null>(null);

  const handleUpdateLabel = async (versionId: string) => {
    setActionError(null);
    try {
      const updated = await api.versions.updateLabel(pageId, versionId, editLabel);
      setVersions((prev) => prev.map((v) => (v.id === versionId ? { ...v, label: updated.label } : v)));
    } catch {
      setActionError(t('updateLabelError'));
    }
    setEditingId(null);
  };

  const handleDelete = async (versionId: string) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    setActionError(null);
    try {
      await api.versions.delete(pageId, versionId);
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    } catch {
      setActionError(t('deleteError'));
    }
  };

  const handleRestore = (versionId: string, versionNumber: number) => {
    if (!window.confirm(t('restoreConfirm', { number: versionNumber }))) return;
    onRestore(versionId);
  };

  return (
    <div className="w-64 lg:w-72 xl:w-80 bg-surface border-l border-surface-elevated\/80 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-elevated\/80 shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-secondary" />
          <h2 className="text-sm font-medium text-primary">{t('title')}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-secondary p-1 rounded hover:bg-surface-card\/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Error feedback */}
      {actionError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {actionError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-muted animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-card flex items-center justify-center mb-3">
              <History className="w-6 h-6 text-muted" />
            </div>
            <p className="text-sm text-secondary mb-1">{t('emptyTitle')}</p>
            <p className="text-xs text-muted">{t('emptyDescription')}</p>
          </div>
        ) : (
          <div className="relative px-4 py-3">
            {/* Timeline line */}
            <div className="absolute left-[29px] top-6 bottom-6 w-px bg-surface-card" />

            <div className="space-y-1">
              {versions.map((version, idx) => {
                const config = TRIGGER_CONFIG[version.trigger] || TRIGGER_CONFIG.manual;
                const Icon = config.icon;
                const isEditing = editingId === version.id;
                const isFirst = idx === 0;

                return (
                  <div key={version.id} className="relative group">
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-3 w-[14px] h-[14px] rounded-full border-2 z-10 ${
                      isFirst
                        ? 'bg-primary bg-[#2563EB] border-[#2563EB]'
                        : 'bg-surface-card border-default group-hover:border-default'
                    }`} />

                    {/* Card */}
                    <div className="ml-6 bg-surface-elevated\/50 hover:bg-surface-elevated border border-subtle\/60 hover:border-default\/80 rounded-lg p-3 transition-colors">
                      {/* Top row: version number + trigger badge */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-primary">
                          v{version.version_number}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${config.color}`}>
                          <Icon className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                          {t(config.labelKey)}
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
                              if (e.key === 'Enter') handleUpdateLabel(version.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="flex-1 bg-surface-card text-xs text-primary px-2 py-1 rounded border border-default outline-none focus:border-[#2563EB]"
                          />
                          <button onClick={() => handleUpdateLabel(version.id)} className="text-emerald-400 hover:text-emerald-300 p-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-muted hover:text-secondary p-0.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : version.label ? (
                        <p
                          className="text-xs text-secondary mb-1.5 cursor-pointer hover:text-primary"
                          onDoubleClick={() => { setEditingId(version.id); setEditLabel(version.label); }}
                          title={t('editHint')}
                        >
                          {version.label}
                        </p>
                      ) : null}

                      {/* Meta row */}
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(version.created_at, locale, t)}
                        </span>
                        {version.created_by_name && (
                          <span>{version.created_by_name}</span>
                        )}
                        <span>{formatBytes(version.size_bytes, locale)}</span>
                      </div>

                      {/* Actions (visible on hover) */}
                      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onPreview(version.id)}
                          className="text-[10px] text-secondary hover:text-primary bg-surface-card hover:bg-default px-2 py-1 rounded transition-colors"
                        >
                          {t('preview')}
                        </button>
                        <button
                          onClick={() => handleRestore(version.id, version.version_number)}
                          className="text-[10px] text-primary-color hover:text-[#2563EB]/80 bg-primary\/10 hover:bg-primary\/20 px-2 py-1 rounded transition-colors"
                        >
                          {t('restore')}
                        </button>
                        <button
                          onClick={() => { setEditingId(version.id); setEditLabel(version.label); }}
                          className="text-muted hover:text-secondary p-1 rounded hover:bg-surface-card transition-colors"
                          title={t('editLabel')}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {versions.length > 1 && (
                          <button
                            onClick={() => handleDelete(version.id)}
                            className="text-muted hover:text-red-400 p-1 rounded hover:bg-surface-card transition-colors"
                            title={t('deleteVersion')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => fetchVersions(currentPage + 1, true)}
                  disabled={loadingMore}
                  className="flex items-center gap-1 text-xs text-muted hover:text-secondary px-3 py-1.5 rounded hover:bg-surface-card\/50 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {t('loadMore')}
                </button>
              </div>
            )}

            {/* Plan limit notice */}
            {isPlanLimited && (
              <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-400">
                  {t('upgradeNotice')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { useTranslations } from 'next-intl';
import { X, RotateCcw, Columns2, Maximize2, Loader2, AlertCircle } from 'lucide-react';
import { UntypedBlockContent } from '@/components/blocks/BlockContent';
import { isBlockType } from '@/lib/block-data';
import { defaultBlockStyles } from '@/types/blocks';
import { api } from '@/lib/api';
import type { ApiPageVersionDetail } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { useEditorStore } from '@/store/editor-store';
import { apiToTokens } from '@/lib/design-tokens';
import { pageThemeVars } from '@/lib/page-theme';
import { computeVersionDiff } from '@/lib/version-diff';
import type { DiffStatus, DiffBlock as VersionDiffBlock } from '@/lib/version-diff';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface VersionPreviewModalProps {
  pageId: string;
  versionId: string;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}

interface SnapshotBlock {
  id: string;
  type: string;
  order: number;
  data: unknown;
  styles: Record<string, unknown>;
}

type DiffBlock = VersionDiffBlock<SnapshotBlock>;

const DIFF_BORDERS: Record<DiffStatus, string> = {
  added: 'ring-2 ring-emerald-500/60',
  removed: 'ring-2 ring-red-500/60',
  modified: 'ring-2 ring-amber-500/60',
  moved: 'ring-2 ring-primary/60',
  unchanged: '',
};

const DIFF_LABELS: Record<DiffStatus, { color: string } | null> = {
  added: { color: 'bg-emerald-500/20 text-success' },
  removed: { color: 'bg-red-500/20 text-error' },
  modified: { color: 'bg-amber-500/20 text-warning' },
  moved: { color: 'bg-primary/20 text-primary-color' },
  unchanged: null,
};

function BlockRenderer({ block, diffStatus, showDiff }: { block: SnapshotBlock; diffStatus?: DiffStatus; showDiff: boolean }) {
  const t = useTranslations('versionPreview');
  if (!isBlockType(block.type)) return null;

  const s = { ...defaultBlockStyles, ...block.styles };
  const blockStyle: React.CSSProperties = {
    overflow: 'hidden',
    ...(s.paddingTop ? { paddingTop: s.paddingTop } : {}),
    ...(s.paddingBottom ? { paddingBottom: s.paddingBottom } : {}),
    ...(s.paddingLeft ? { paddingLeft: s.paddingLeft } : {}),
    ...(s.paddingRight ? { paddingRight: s.paddingRight } : {}),
    ...(s.marginTop ? { marginTop: s.marginTop } : {}),
    ...(s.marginBottom ? { marginBottom: s.marginBottom } : {}),
    ...(s.bgColor ? { backgroundColor: s.bgColor, '--block-bg': s.bgColor } as React.CSSProperties : {}),
    ...(s.borderRadius ? { borderRadius: s.borderRadius } : {}),
  };

  const diffClass = showDiff && diffStatus ? DIFF_BORDERS[diffStatus] : '';
  const diffLabel = showDiff && diffStatus ? DIFF_LABELS[diffStatus] : null;

  return (
    <div className={`relative ${diffClass}`} style={blockStyle}>
      {diffLabel && (
        <div className={`absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full font-medium ${diffLabel.color}`}>
          {diffStatus ? t(diffStatus) : null}
        </div>
      )}
      <UntypedBlockContent block={block} isPreviewMode={true} />
    </div>
  );
}

function PageColumn({ title, blocks, diffBlocks, showDiff, themeVars }: {
  title: string;
  themeVars: React.CSSProperties;
  blocks: SnapshotBlock[];
  diffBlocks?: DiffBlock[];
  showDiff: boolean;
}) {
  const t = useTranslations('versionPreview');
  const items = diffBlocks || blocks.map((b) => ({ block: b, status: 'unchanged' as DiffStatus }));

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="px-4 py-2 bg-surface-elevated/80 border-b border-surface-elevated/80 shrink-0">
        <span className="text-xs font-medium text-secondary">{title}</span>
      </div>
      <div className="@container flex-1 overflow-y-auto bg-white" style={themeVars}>
        {items.map((item, i) => (
          <BlockRenderer
            key={`${item.block.type}-${i}`}
            block={item.block}
            diffStatus={item.status}
            showDiff={showDiff}
          />
        ))}
        {items.length === 0 && (
          <div className="flex items-center justify-center h-64 text-muted text-sm">
            {t('emptyColumn')}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VersionPreviewModal({ pageId, versionId, onClose, onRestore }: VersionPreviewModalProps) {
  const t = useTranslations('versionPreview');
  const historyT = useTranslations('versionHistory');
  const commonT = useTranslations('common');
  const rootT = useTranslations();
  const [version, setVersion] = useState<ApiPageVersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // A modal dialog: focus inside, Tab trapped, Esc closes, focus back to the opener
  useDialogFocus(dialogRef, true, onClose);

  const currentBlocks = useEditorStore((s) => s.page.blocks);
  const currentPage = useEditorStore((s) => s.page);
  const currentThemeVars = useMemo(
    () => pageThemeVars(currentPage.designTokens),
    [currentPage.designTokens],
  );

  useEffect(() => {
    let cancelled = false;
    api.versions.get(pageId, versionId).then((v) => {
      if (!cancelled) {
        setVersion(v);
        setLoading(false);
      }
    }).catch((e: unknown) => {
      if (cancelled) return;
      setLoadError(apiErrorMessage(e, rootT, 'versionPreview.loadError'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pageId, versionId, rootT]);

  // Build current blocks as SnapshotBlock format
  const currentSnapshot: SnapshotBlock[] = useMemo(() =>
    currentBlocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      data: b.data,
      styles: b.styles as unknown as Record<string, unknown>,
    })),
    [currentBlocks],
  );

  const versionSnapshot = useMemo(() => version?.snapshot ?? [], [version]);
  const versionThemeVars = useMemo(
    () => pageThemeVars(apiToTokens(version?.page_metadata.design_tokens)),
    [version],
  );

  const { currentDiff, versionDiff } = useMemo(
    () => computeVersionDiff(currentSnapshot, versionSnapshot),
    [currentSnapshot, versionSnapshot],
  );

  const cancelRestore = () => {
    setConfirmRestore(false);
    restoreButtonRef.current?.focus();
  };

  return (
    <>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-surface-elevated/80 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 id={titleId} className="text-sm font-medium text-primary">
            {loading
              ? commonT('loading')
              : version
                ? t('title', { number: version.version_number })
                : t('titleUnknown')}
          </h2>
          {version?.label && (
            <span className="text-xs text-muted">{version.label}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Diff toggle */}
          <button
            type="button"
            aria-pressed={showDiff}
            onClick={() => setShowDiff((v) => !v)}
            className={`text-xs px-2.5 py-1 pointer-coarse:min-h-11 rounded-md transition-colors ${
              showDiff
                ? 'bg-amber-500/15 text-warning border border-amber-500/30'
                : 'text-muted hover:text-secondary border border-default hover:border-default'
            }`}
          >
            {t('visualDiff')}
          </button>

          {/* View mode toggle */}
          <div role="group" aria-label={t('viewMode')} className="flex bg-surface-card rounded-lg p-0.5">
            <button
              type="button"
              aria-pressed={!splitView}
              aria-label={t('fullView')}
              onClick={() => setSplitView(false)}
              className={`p-1.5 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-md transition-colors ${!splitView ? 'bg-surface-card text-primary' : 'text-muted hover:text-secondary'}`}
              title={t('fullView')}
            >
              <Maximize2 aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-pressed={splitView}
              aria-label={t('compareView')}
              onClick={() => setSplitView(true)}
              className={`p-1.5 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-md transition-colors ${splitView ? 'bg-surface-card text-primary' : 'text-muted hover:text-secondary'}`}
              title={t('compareView')}
            >
              <Columns2 aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Restore */}
          <button
            ref={restoreButtonRef}
            type="button"
            onClick={() => setConfirmRestore(true)}
            disabled={loading || !version}
            className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 pointer-coarse:min-h-11 rounded-md shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            {t('restore')}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={commonT('close')}
            className="text-muted hover:text-secondary p-1.5 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded hover:bg-surface-card/50 transition-colors"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 aria-hidden="true" className="w-6 h-6 text-muted animate-spin" />
        </div>
      ) : loadError ? (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <AlertCircle aria-hidden="true" className="w-6 h-6 text-error" />
          <p className="text-sm text-secondary">{loadError}</p>
        </div>
      ) : splitView ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r border-surface-elevated/80 flex flex-col min-w-0">
            <PageColumn title={t('currentVersion')} themeVars={currentThemeVars} blocks={currentSnapshot} diffBlocks={currentDiff} showDiff={showDiff} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <PageColumn title={`v${version?.version_number}${version?.label ? ` - ${version.label}` : ''}`} themeVars={versionThemeVars} blocks={versionSnapshot} diffBlocks={versionDiff} showDiff={showDiff} />
          </div>
        </div>
      ) : (
        <div className="@container flex-1 overflow-y-auto bg-white" style={versionThemeVars}>
          {versionDiff.map((item, i) => (
            <BlockRenderer
              key={item.block.id || `${item.block.type}-${i}`}
              block={item.block}
              diffStatus={item.status}
              showDiff={showDiff}
            />
          ))}
          {versionSnapshot.length === 0 && (
            <div className="flex items-center justify-center h-64 text-muted text-sm">
              {t('emptyVersion')}
            </div>
          )}
        </div>
      )}

      {/* Diff legend */}
      {showDiff && !loading && !loadError && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-surface-elevated/80 shrink-0">
          <span className="text-[10px] text-muted">{t('legend')}</span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/60" />
            <span className="text-muted">{t('added')}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40 border border-red-500/60" />
            <span className="text-muted">{t('removed')}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500/60" />
            <span className="text-muted">{t('modified')}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/40 border border-primary/60" />
            <span className="text-muted">{t('moved')}</span>
          </span>
        </div>
      )}
    </div>

    <ConfirmDialog
      open={confirmRestore}
      title={historyT('restoreTitle', { number: version?.version_number ?? 0 })}
      message={historyT('restoreConfirm', { number: version?.version_number ?? 0 })}
      confirmLabel={historyT('restore')}
      variant="default"
      onConfirm={() => {
        setConfirmRestore(false);
        onRestore(versionId);
      }}
      onCancel={cancelRestore}
    />
    </>
  );
}

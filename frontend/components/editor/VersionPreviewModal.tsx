'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { X, RotateCcw, Columns2, Maximize2, Loader2 } from 'lucide-react';
import { blockRegistry } from '@/lib/block-registry';
import { defaultBlockStyles } from '@/types/blocks';
import { api } from '@/lib/api';
import type { ApiPageVersionDetail } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';

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
  data: Record<string, unknown>;
  styles: Record<string, unknown>;
}

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffBlock {
  block: SnapshotBlock;
  status: DiffStatus;
}

function computeDiff(
  currentBlocks: SnapshotBlock[],
  versionBlocks: SnapshotBlock[],
): { currentDiff: DiffBlock[]; versionDiff: DiffBlock[] } {
  // Match blocks by type + order position since UUIDs change on restore
  const currentByKey = currentBlocks.map((b, i) => ({ block: b, key: `${b.type}:${i}` }));
  const versionByKey = versionBlocks.map((b, i) => ({ block: b, key: `${b.type}:${i}` }));

  const versionKeys = new Set(versionByKey.map((v) => v.key));
  const currentKeys = new Set(currentByKey.map((c) => c.key));

  const versionMap = new Map(versionByKey.map((v) => [v.key, v.block]));
  const currentMap = new Map(currentByKey.map((c) => [c.key, c.block]));

  const currentDiff: DiffBlock[] = currentByKey.map(({ block, key }) => {
    if (!versionKeys.has(key)) {
      return { block, status: 'added' };
    }
    const vBlock = versionMap.get(key)!;
    const dataChanged = JSON.stringify(block.data) !== JSON.stringify(vBlock.data);
    const stylesChanged = JSON.stringify(block.styles) !== JSON.stringify(vBlock.styles);
    return { block, status: dataChanged || stylesChanged ? 'modified' : 'unchanged' };
  });

  const versionDiff: DiffBlock[] = versionByKey.map(({ block, key }) => {
    if (!currentKeys.has(key)) {
      return { block, status: 'removed' };
    }
    const cBlock = currentMap.get(key)!;
    const dataChanged = JSON.stringify(block.data) !== JSON.stringify(cBlock.data);
    const stylesChanged = JSON.stringify(block.styles) !== JSON.stringify(cBlock.styles);
    return { block, status: dataChanged || stylesChanged ? 'modified' : 'unchanged' };
  });

  return { currentDiff, versionDiff };
}

const DIFF_BORDERS: Record<DiffStatus, string> = {
  added: 'ring-2 ring-emerald-500/60',
  removed: 'ring-2 ring-red-500/60',
  modified: 'ring-2 ring-amber-500/60',
  unchanged: '',
};

const DIFF_LABELS: Record<DiffStatus, { color: string } | null> = {
  added: { color: 'bg-emerald-500/20 text-emerald-400' },
  removed: { color: 'bg-red-500/20 text-red-400' },
  modified: { color: 'bg-amber-500/20 text-amber-400' },
  unchanged: null,
};

function BlockRenderer({ block, diffStatus, showDiff }: { block: SnapshotBlock; diffStatus?: DiffStatus; showDiff: boolean }) {
  const t = useTranslations('versionPreview');
  const BlockComponent = blockRegistry[block.type]?.component;
  if (!BlockComponent) return null;

  const s = { ...defaultBlockStyles, ...block.styles };
  const blockStyle: React.CSSProperties = {
    overflow: 'hidden',
    ...(s.paddingTop ? { paddingTop: s.paddingTop } : {}),
    ...(s.paddingBottom ? { paddingBottom: s.paddingBottom } : {}),
    ...(s.paddingLeft ? { paddingLeft: s.paddingLeft } : {}),
    ...(s.paddingRight ? { paddingRight: s.paddingRight } : {}),
    ...(s.marginTop ? { marginTop: s.marginTop } : {}),
    ...(s.marginBottom ? { marginBottom: s.marginBottom } : {}),
    ...(s.bgColor ? { backgroundColor: s.bgColor, '--theme-bg': s.bgColor } as React.CSSProperties : {}),
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
      <BlockComponent
        blockId={block.id}
        data={block.data}
        isMobile={false}
        isTablet={false}
        isPreviewMode={true}
      />
    </div>
  );
}

function PageColumn({ title, blocks, diffBlocks, showDiff }: {
  title: string;
  blocks: SnapshotBlock[];
  diffBlocks?: DiffBlock[];
  showDiff: boolean;
}) {
  const t = useTranslations('versionPreview');
  const items = diffBlocks || blocks.map((b) => ({ block: b, status: 'unchanged' as DiffStatus }));

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="px-4 py-2 bg-surface-elevated\/80 border-b border-surface-elevated\/80 shrink-0">
        <span className="text-xs font-medium text-secondary">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
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
  const [version, setVersion] = useState<ApiPageVersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [splitView, setSplitView] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const currentBlocks = useEditorStore((s) => s.page.blocks);

  useEffect(() => {
    let cancelled = false;
    api.versions.get(pageId, versionId).then((v) => {
      if (!cancelled) {
        setVersion(v);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pageId, versionId]);

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

  const versionSnapshot = version?.snapshot || [];

  const { currentDiff, versionDiff } = useMemo(
    () => computeDiff(currentSnapshot, versionSnapshot),
    [currentSnapshot, versionSnapshot],
  );

  const handleRestore = () => {
    if (!window.confirm(historyT('restoreConfirm', { number: version?.version_number ?? 0 }))) return;
    onRestore(versionId);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-elevated\/80 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-primary">
            {loading
              ? commonT('loading')
              : t('title', { number: version?.version_number ?? 0 })}
          </h2>
          {version?.label && (
            <span className="text-xs text-muted">{version.label}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Diff toggle */}
          <button
            onClick={() => setShowDiff((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              showDiff
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-muted hover:text-secondary border border-default hover:border-default'
            }`}
          >
            {t('visualDiff')}
          </button>

          {/* View mode toggle */}
          <div className="flex bg-surface-card rounded-lg p-0.5">
            <button
              onClick={() => setSplitView(false)}
              className={`p-1.5 rounded-md transition-colors ${!splitView ? 'bg-surface-card text-primary' : 'text-muted hover:text-secondary'}`}
              title={t('fullView')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSplitView(true)}
              className={`p-1.5 rounded-md transition-colors ${splitView ? 'bg-surface-card text-primary' : 'text-muted hover:text-secondary'}`}
              title={t('compareView')}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Restore */}
          <button
            onClick={handleRestore}
            disabled={loading}
            className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-md shadow-lg shadow-[#2563EB]/20 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('restore')}
          </button>

          <button
            onClick={onClose}
            className="text-muted hover:text-secondary p-1.5 rounded hover:bg-surface-card\/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-muted animate-spin" />
        </div>
      ) : splitView ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 border-r border-surface-elevated\/80 flex flex-col min-w-0">
            <PageColumn title={t('currentVersion')} blocks={currentSnapshot} diffBlocks={currentDiff} showDiff={showDiff} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <PageColumn title={`v${version?.version_number}${version?.label ? ` - ${version.label}` : ''}`} blocks={versionSnapshot} diffBlocks={versionDiff} showDiff={showDiff} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-white">
          {versionDiff.map((item, i) => (
            <BlockRenderer
              key={`${item.block.type}-${i}`}
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
      {showDiff && !loading && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-surface-elevated\/80 shrink-0">
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
        </div>
      )}
    </div>
  );
}

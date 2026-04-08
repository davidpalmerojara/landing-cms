'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  Globe,
  Plus,
  Layers,
  Loader2,
  Check,
  AlertTriangle,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { resolveStyles } from '@/types/blocks';
import { defaultDesignTokens, tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';
import { getThemeById } from '@/lib/themes';
import MobileBlockCard from './MobileBlockCard';
import MobileBottomSheet from './MobileBottomSheet';
import MobileBlockEditor from './MobileBlockEditor';

interface MobileEditorProps {
  pageId: string;
  onSave: () => Promise<boolean | undefined>;
  onPublish: () => Promise<boolean | undefined>;
}

export default function MobileEditor({ pageId, onSave, onPublish }: MobileEditorProps) {
  const t = useTranslations();
  const page = useEditorStore((s) => s.page);
  const autoSaveStatus = useEditorStore((s) => s.autoSaveStatus);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);
  const requestDeleteBlock = useEditorStore((s) => s.requestDeleteBlock);
  const moveBlockUp = useEditorStore((s) => s.moveBlockUp);
  const moveBlockDown = useEditorStore((s) => s.moveBlockDown);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addBlock = useEditorStore((s) => s.addBlock);
  const addToast = useEditorStore((s) => s.addToast);
  const setPageWithHistory = useEditorStore((s) => s.setPageWithHistory);

  // --- Sheet state ---
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // --- Long press preview ---
  const [previewBlockId, setPreviewBlockId] = useState<string | null>(null);

  // --- Editable page name ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(page.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // --- Online/offline ---
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [isReconnecting, setIsReconnecting] = useState(false);

  // --- Drag state ---
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRectsRef = useRef<DOMRect[]>([]);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef(0);

  // --- Animation state for new blocks ---
  const [animatingBlockId, setAnimatingBlockId] = useState<string | null>(null);

  // --- Focus restore ref ---
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // --- Cleanup drag timer on unmount ---
  useEffect(() => {
    return () => {
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    };
  }, []);

  // --- Online/offline detection ---
  useEffect(() => {
    const goOnline = () => {
      setIsReconnecting(true);
      // Trigger a save attempt
      onSave().then((success) => {
        setIsReconnecting(false);
        setIsOnline(true);
        if (success) {
          addToast(t('mobile.changesSynced'), 'success');
        }
      }).catch(() => {
        setIsReconnecting(false);
        setIsOnline(true);
      });
    };
    const goOffline = () => {
      setIsOnline(false);
      setIsReconnecting(false);
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [addToast, onSave, t]);

  // --- Focus name input when editing starts ---
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // --- Drag handlers ---
  const handleDragStart = useCallback((e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    touchStartYRef.current = touch.clientY;

    if (listRef.current) {
      const cards = listRef.current.querySelectorAll('[role="listitem"]');
      cardRectsRef.current = Array.from(cards).map((c) => c.getBoundingClientRect());
    }

    dragTimerRef.current = setTimeout(() => {
      setDragIndex(index);
      setDropIndex(index);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 150);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (dragIndex === null && dragTimerRef.current) {
        const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
        if (dy > 8) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
        }
        return;
      }
      if (dragIndex === null) return;

      const touch = e.touches[0];
      const rects = cardRectsRef.current;
      let newDropIndex = rects.length;
      for (let i = 0; i < rects.length; i++) {
        const mid = rects[i].top + rects[i].height / 2;
        if (touch.clientY < mid) {
          newDropIndex = i;
          break;
        }
      }
      setDropIndex(newDropIndex);
    },
    [dragIndex],
  );

  const handleTouchEnd = useCallback(() => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      useEditorStore.getState().reorderBlocks(dragIndex, dropIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, dropIndex]);

  // --- Block actions ---
  const handleTap = useCallback((blockId: string) => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    selectBlock(blockId);
    setEditingBlockId(blockId);
  }, [selectBlock]);

  const handleLongPress = useCallback((blockId: string) => {
    setPreviewBlockId((prev) => (prev === blockId ? null : blockId));
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingBlockId(null);
    // Restore focus after sheet close animation
    setTimeout(() => {
      lastFocusedRef.current?.focus();
      lastFocusedRef.current = null;
    }, 300);
  }, []);

  const handleDuplicate = useCallback((blockId: string) => {
    duplicateBlock(blockId);
    addToast(t('mobile.blockDuplicated'), 'success');
    setTimeout(() => {
      const blocks = useEditorStore.getState().page.blocks;
      const duplicatedBlock = blocks.find((block) => block.id !== blockId && block.id === useEditorStore.getState().selectedBlockId);
      if (duplicatedBlock) {
        setAnimatingBlockId(duplicatedBlock.id);
        setTimeout(() => setAnimatingBlockId(null), 400);
      }
    }, 0);
  }, [addToast, duplicateBlock, t]);

  const handleDelete = useCallback((blockId: string) => {
    requestDeleteBlock(blockId);
  }, [requestDeleteBlock]);

  // --- Add block with scroll ---
  const handleAddBlock = useCallback((type: string) => {
    const def = blockRegistry[type];
    if (!def) return;
    const translatedLabel = getTranslatedBlockLabel(type, t, def.label);
    addBlock(type, translatedLabel, null, def.initialData);
    setShowAddSheet(false);

    setTimeout(() => {
      const blocks = useEditorStore.getState().page.blocks;
      const newBlock = blocks[blocks.length - 1];
      if (newBlock) {
        // Animate the new block
        setAnimatingBlockId(newBlock.id);
        setTimeout(() => setAnimatingBlockId(null), 400);

        // Scroll to new block
        if (listRef.current) {
          const items = listRef.current.querySelectorAll('[role="listitem"]');
          const lastItem = items[items.length - 1];
          if (lastItem) {
            lastItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }

        // Open editor
        setEditingBlockId(newBlock.id);
        selectBlock(newBlock.id);
      }
    }, 50);
  }, [addBlock, selectBlock]);

  // --- Name editing ---
  const handleNameTap = useCallback(() => {
    setNameValue(page.name);
    setIsEditingName(true);
  }, [page.name]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== page.name) {
      setPageWithHistory((prev) => ({ ...prev, name: trimmed }));
    } else {
      setNameValue(page.name);
    }
    setIsEditingName(false);
  }, [nameValue, page.name, setPageWithHistory]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') {
      setNameValue(page.name);
      setIsEditingName(false);
    }
  }, [handleNameSubmit, page.name]);

  // --- Publish ---
  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    const success = await onPublish();
    setIsPublishing(false);
    setShowPublishSheet(false);
    if (success) {
      addToast(t('mobile.pagePublished'), 'success');
    } else {
      addToast(t('mobile.publishError'), 'error');
    }
  }, [addToast, onPublish, t]);

  // --- Retry save ---
  const handleRetrySave = useCallback(() => {
    onSave();
  }, [onSave]);

  // --- Preview mode ---
  if (isPreview) {
    return <MobilePreview page={page} onBack={() => setIsPreview(false)} />;
  }

  // --- Connection + save status ---
  const connectionStatus = !isOnline
    ? 'offline'
    : isReconnecting
    ? 'reconnecting'
    : autoSaveStatus;

  const statusConfig: Record<string, { icon: typeof Check; label: string; color: string }> = {
    saving: { icon: Loader2, label: t('mobile.saving'), color: 'text-muted' },
    saved: { icon: Check, label: t('mobile.saved'), color: 'text-emerald-400' },
    error: { icon: AlertTriangle, label: t('mobile.error'), color: 'text-orange-400' },
    offline: { icon: WifiOff, label: t('mobile.offline'), color: 'text-orange-400' },
    reconnecting: { icon: RefreshCw, label: t('mobile.reconnecting'), color: 'text-muted' },
  };

  const status = statusConfig[connectionStatus];
  const StatusIcon = status?.icon || null;

  const availableBlocks = getAvailableBlocks().map((block) => ({
    ...block,
    label: getTranslatedBlockLabel(block.type, t, block.label),
  }));

  return (
    <div className="flex flex-col h-dvh bg-surface text-white">
      {/* --- Toolbar --- */}
      <header className="flex items-center justify-between px-4 h-14 bg-surface-card\/80 backdrop-blur-2xl border-b border-default/15 shrink-0 z-30">
        {/* Left: Back */}
        <a
          href="/dashboard"
          className="flex items-center justify-center text-secondary active:text-white min-w-11 min-h-11 -ml-2 rounded-lg"
          aria-label={t('common.backToDashboard')}
        >
          <ArrowLeft size={20} />
        </a>

        {/* Center: Page name (editable) + status */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              className="text-sm font-medium text-white bg-surface-card border border-default\/30 rounded-lg px-3 py-1 outline-none focus:border-[#2563EB]/50 max-w-[180px] text-center"
              aria-label={t('mobile.pageName')}
            />
          ) : (
            <button
              onClick={handleNameTap}
              className="text-sm font-medium text-white truncate max-w-[160px] px-2 py-1 rounded-lg active:bg-surface-card transition-colors"
              aria-label={t('mobile.editPageName')}
            >
              {page.name}
            </button>
          )}
          {StatusIcon && (
            <span
              className={`shrink-0 flex items-center gap-1 ${status.color}`}
              aria-live="polite"
              aria-label={status.label}
            >
              <StatusIcon size={13} className={connectionStatus === 'saving' || connectionStatus === 'reconnecting' ? 'animate-spin' : ''} />
              {(connectionStatus === 'error' || connectionStatus === 'offline') && (
                <span className="text-[10px] font-medium">{status.label}</span>
              )}
            </span>
          )}
          {connectionStatus === 'error' && (
            <button
              onClick={handleRetrySave}
              className="text-[10px] text-primary-color font-semibold active:opacity-70 ml-1 min-h-11 flex items-center"
            >
              {t('mobile.retrySave')}
            </button>
          )}
        </div>

        {/* Right: Preview + Publish */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPreview(true)}
            className="flex items-center justify-center min-w-11 min-h-11 text-secondary active:text-white rounded-lg"
            aria-label={t('mobile.previewPage')}
          >
            <Eye size={20} />
          </button>
          <button
            onClick={() => setShowPublishSheet(true)}
            className={`flex items-center justify-center min-w-11 min-h-11 rounded-lg ${
              page.status === 'published'
                ? 'text-emerald-400'
                : 'text-secondary active:text-white'
            }`}
            aria-label={page.status === 'published' ? t('mobile.publishedTitle') : t('mobile.publishTitle')}
          >
            <Globe size={20} />
          </button>
        </div>
      </header>

      {/* --- Block list --- */}
      <main
        className="flex-1 overflow-y-auto px-4 py-4"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {page.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-card border border-default/15 flex items-center justify-center">
              <Layers size={28} className="text-default" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{t('mobile.emptyTitle')}</p>
              <p className="text-sm text-[#888] mt-1">
                {t('mobile.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-2" role="list" aria-label={t('mobile.pageBlocks')}>
            {page.blocks.map((block, i) => {
              const isNew = animatingBlockId === block.id;
              return (
                <div
                  key={block.id}
                  className={isNew ? 'animate-slideIn' : ''}
                  style={{
                    opacity: dragIndex === i ? 0.5 : 1,
                    transform: dragIndex === i ? 'scale(1.02)' : undefined,
                    transition: dragIndex !== null ? 'transform 150ms, opacity 150ms' : undefined,
                  }}
                >
                  {dragIndex !== null && dropIndex === i && dragIndex !== i && (
                    <div className="h-0.5 bg-primary rounded-full mx-4 mb-1" />
                  )}
                  <MobileBlockCard
                    block={block}
                    index={i}
                    isFirst={i === 0}
                    isLast={i === page.blocks.length - 1}
                    isPreviewExpanded={previewBlockId === block.id}
                    onTap={handleTap}
                    onLongPress={handleLongPress}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onMoveUp={(id) => moveBlockUp(id)}
                    onMoveDown={(id) => moveBlockDown(id)}
                    onDragHandleProps={{ onTouchStart: handleDragStart }}
                  />
                </div>
              );
            })}
            {dragIndex !== null && dropIndex === page.blocks.length && (
              <div className="h-0.5 bg-primary rounded-full mx-4 mt-1" />
            )}
          </div>
        )}
      </main>

      {/* --- FAB: Add block --- */}
      {!editingBlockId && !showAddSheet && (
        <button
          onClick={() => setShowAddSheet(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-black/30 active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
          aria-label={t('mobile.addBlock')}
        >
          <Plus size={24} className="text-black" />
        </button>
      )}

      {/* --- Bottom sheet: Block editor --- */}
      <MobileBottomSheet
        open={editingBlockId !== null}
        onClose={handleCloseEditor}
        title={
          editingBlockId
            ? t('mobile.editBlock', {
                name: getTranslatedBlockLabel(
                  page.blocks.find((b) => b.id === editingBlockId)?.type || '',
                  t,
                  blockRegistry[page.blocks.find((b) => b.id === editingBlockId)?.type || '']?.label || t('editor.components'),
                ),
              })
            : undefined
        }
        ariaLabel={t('mobile.editBlockAria')}
        fullHeight
      >
        {editingBlockId && <MobileBlockEditor blockId={editingBlockId} />}
      </MobileBottomSheet>

      {/* --- Bottom sheet: Add block picker --- */}
      <MobileBottomSheet
        open={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title={t('mobile.addBlock')}
        ariaLabel={t('mobile.selectBlockType')}
        fullHeight={false}
      >
        <div className="px-4 py-3 space-y-1">
          {availableBlocks.map((b) => {
            const BlockIcon = b.icon;
            return (
              <button
                key={b.type}
                onClick={() => handleAddBlock(b.type)}
                className="w-full flex items-center gap-4 px-4 py-3.5 min-h-11 rounded-xl active:bg-surface-card transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-card border border-default/15 flex items-center justify-center shrink-0">
                  <BlockIcon size={18} className="text-primary-color" />
                </div>
                <span className="text-sm font-medium text-white">{b.label}</span>
              </button>
            );
          })}
        </div>
      </MobileBottomSheet>

      {/* --- Bottom sheet: Publish confirmation --- */}
      <MobileBottomSheet
        open={showPublishSheet}
        onClose={() => setShowPublishSheet(false)}
        title={page.status === 'published' ? t('mobile.publishedTitle') : t('mobile.publishTitle')}
        ariaLabel={t('mobile.publishTitle')}
        fullHeight={false}
      >
        <div className="px-5 py-4 space-y-4">
          {page.status === 'published' ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">
                  {t('mobile.publishedAt', { slug: page.slug })}
                </span>
              </div>
              <a
                href={`/p/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3.5 rounded-xl text-center text-sm font-semibold text-black active:opacity-80"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
              >
                {t('mobile.viewPublicPage')}
              </a>
            </>
          ) : (
            <>
              <p className="text-sm text-[#aaa]">{t('mobile.publishDescription', { slug: page.slug })}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPublishSheet(false)}
                  className="flex-1 py-3.5 rounded-xl bg-surface-card text-sm font-medium text-secondary active:bg-[#333]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="flex-1 py-3.5 rounded-xl text-sm font-semibold text-black active:opacity-80 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
                >
                  {isPublishing ? t('editor.publishLoading') : t('common.publish')}
                </button>
              </div>
            </>
          )}
        </div>
      </MobileBottomSheet>
    </div>
  );
}

// --- Inline preview component ---

function MobilePreview({
  page,
  onBack,
}: {
  page: ReturnType<typeof useEditorStore.getState>['page'];
  onBack: () => void;
}) {
  const t = useTranslations();
  const [showBar, setShowBar] = useState(true);

  // Build theme CSS variables (same logic as CanvasViewport and PublicPageClient)
  const tokens = page.designTokens || defaultDesignTokens;
  const theme = getThemeById(page.themeId || 'default', page.customTheme);
  const bpVars = tokensToCssVars(tokens);
  const legacyVars = page.designTokens ? tokensToThemeVars(tokens) : {
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
    <div className="fixed inset-0 z-80 bg-white">
      <div
        className="h-full overflow-y-auto"
        style={themeVars}
        onClick={(e) => {
          // Only toggle bar when clicking empty areas, not interactive block elements
          const target = e.target as HTMLElement;
          if (!target.closest('button, a, input, select, textarea, [role="button"]')) {
            setShowBar((v) => !v);
          }
        }}
      >
        {page.blocks.map((block) => {
          const def = blockRegistry[block.type];
          if (!def?.component) return null;
          const Component = def.component;

          // Apply block-level styles (padding, margin, bgColor, borderRadius)
          const s = resolveStyles(block, 'mobile');
          const needsOverflow = block.type === 'navbar';
          const blockStyle: React.CSSProperties = needsOverflow ? {} : { overflow: 'hidden' };
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
              <Component
                blockId={block.id}
                data={block.data}
                isMobile={true}
                isTablet={false}
                isPreviewMode={true}
              />
            </div>
          );
        })}
      </div>

      {showBar && (
        <div className="fixed bottom-6 left-4 right-4 z-90 flex items-center justify-between px-4 py-3 bg-surface-card/90 backdrop-blur-xl rounded-2xl border border-default/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="flex items-center gap-2 text-sm font-medium text-white active:opacity-70 min-h-11"
          >
            <ArrowLeft size={16} /> {t('mobile.backToEditor')}
          </button>
          <span className="text-xs text-[#888]">{t('mobile.previewLabel')}</span>
        </div>
      )}
    </div>
  );
}

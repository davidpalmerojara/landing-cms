'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BoxSelect, Layers, GripVertical, Layout, Lock, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { getBlockDefaults } from '@/lib/block-defaults';
import { revealBlock } from '@/lib/canvas-reveal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { dragEndedRecently } from '@/hooks/useDragManager';
import type { BlockType } from '@/types/blocks';

/** Below Tailwind's `lg` the sidebar is a panel that opens over the canvas (QA-022). */
const OVERLAY_QUERY = '(max-width: 1023.98px)';
/** Frames to keep trying to move focus into a panel that is still opening (about a quarter of a second) */
const MAX_FOCUS_ATTEMPTS = 15;

/** Pans the canvas to a block once React has drawn it (a block added a moment ago). */
function revealSoon(blockId: string | null) {
  if (!blockId) return;
  requestAnimationFrame(() => revealBlock(blockId));
}

export default function LeftSidebar() {
  const t = useTranslations();
  const locale = useLocale();
  const leftTab = useEditorStore((s) => s.leftTab);
  const setLeftTab = useEditorStore((s) => s.setLeftTab);
  const page = useEditorStore((s) => s.page);
  const layerDropIndex = useEditorStore((s) => s.layerDropIndex);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const isDragging = useEditorStore((s) => s.isDragging);
  const dragSource = useEditorStore((s) => s.dragSource);
  const addBlock = useEditorStore((s) => s.addBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const initDrag = useEditorStore((s) => s.initDrag);
  const blockLocks = useEditorStore((s) => s.blockLocks);
  const myConnectionId = useEditorStore((s) => s.myConnectionId);

  const isOverlay = useMediaQuery(OVERLAY_QUERY);
  // Only matters while isOverlay: on wide screens the sidebar is always there
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  const [searchText, setSearchText] = useState('');
  const availableBlocks = getAvailableBlocks().map((block) => ({
    ...block,
    label: getTranslatedBlockLabel(block.type, t, block.label),
  }));
  const layersRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    // The toggle button comes back with the next render
    if (returnFocus) requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  // A component dragged out of the panel needs the canvas behind it: the panel steps aside
  // (it stays mounted, so the finger or mouse keeps its pointer events)
  useEffect(() => useEditorStore.subscribe(
    (s) => s.isDragging && s.dragSource?.action === 'add',
    (draggingComponent) => {
      if (draggingComponent) setIsOpen(false);
    },
  ), []);

  /** Selecting a layer brings its block into view (QA-043). */
  const selectLayer = useCallback((blockId: string) => {
    selectBlock(blockId);
    revealBlock(blockId);
    if (isOverlay) closePanel(false);
  }, [selectBlock, isOverlay, closePanel]);

  const handleLayersKeyDown = useCallback((e: React.KeyboardEvent) => {
    const container = layersRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-layer-item]'));
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev].focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (currentIndex >= 0) {
        const blockId = items[currentIndex].getAttribute('data-block-id');
        if (blockId) selectLayer(blockId);
      }
    }
  }, [selectLayer]);

  // Tabs pattern: the active tab is the Tab stop, arrows switch between the two
  const handleTabsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'components' : e.key === 'End' ? 'layers' : leftTab === 'components' ? 'layers' : 'components';
    setLeftTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const filteredBlocks = searchText.trim()
    ? availableBlocks.filter((b) => {
        const q = searchText.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.type.toLowerCase().includes(q);
      })
    : availableBlocks;

  const handleComponentPointerDown = (
    e: React.PointerEvent,
    type: BlockType,
    label: string,
    initialData: unknown
  ) => {
    if (e.button !== 0) return;
    initDrag(
      { action: 'add', type, label, sourceIndex: null, initialData },
      { x: e.clientX, y: e.clientY }
    );
  };

  /** Tap or click on a component: added at the end of the page, selected and shown. */
  const handleComponentClick = (type: BlockType, label: string) => {
    if (dragEndedRecently()) return; // the drop already added it
    addBlock(type, label, null, getBlockDefaults(type, locale));
    if (isOverlay) closePanel(false);
    revealSoon(useEditorStore.getState().selectedBlockId);
  };

  const handleLayerPointerDown = (
    e: React.PointerEvent,
    index: number,
    block: { type: BlockType; name: string }
  ) => {
    if (e.button !== 0) return;
    initDrag(
      { action: 'reorder', type: block.type, label: getTranslatedBlockLabel(block.type, t, block.name), sourceIndex: index },
      { x: e.clientX, y: e.clientY }
    );
  };

  const isHidden = isOverlay && !isOpen;
  const isOverlayOpen = isOverlay && isOpen;

  const openPanel = () => setIsOpen(true);

  // Once the panel is drawn (no longer `invisible`), focus moves into it: its selected tab (EDITOR2-005).
  // Right after the panel opens the browser ignores `focus()` for a frame or two (it is still
  // coming out of `invisible` and sliding in), so focus stayed on "Bloques": try on each frame
  // until the tab has it (EDITOR3-001)
  useEffect(() => {
    if (!isOverlayOpen) return;
    let frame = 0;
    let attempts = 0;
    const focusSelectedTab = () => {
      const tab = asideRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return;
      tab.focus();
      attempts += 1;
      if (document.activeElement !== tab && attempts < MAX_FOCUS_ATTEMPTS) frame = requestAnimationFrame(focusSelectedTab);
    };
    frame = requestAnimationFrame(focusSelectedTab);
    return () => cancelAnimationFrame(frame);
  }, [isOverlayOpen]);

  // Esc closes the open panel wherever focus is, and gives focus back to "Bloques" (EDITOR2-005)
  useEffect(() => {
    if (!isOverlayOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closePanel(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOverlayOpen, closePanel]);

  return (
    <>
      {/* Narrow screens: the panel opens over the canvas from this button. It stays mounted
          under the open panel, so it can say it is expanded and take focus back (EDITOR2-005) */}
      {isOverlay && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => (isOpen ? closePanel(true) : openPanel())}
          aria-expanded={isOpen}
          aria-controls="editor-left-sidebar"
          className="lg:hidden absolute top-3 left-3 z-30 flex items-center gap-2 h-11 px-4 rounded-full bg-surface-card/95 backdrop-blur-2xl border border-default/20 shadow-xl text-[13px] font-medium text-primary hover:bg-surface-elevated transition-colors"
        >
          <BoxSelect aria-hidden="true" className="w-4 h-4 text-primary-color" />
          {t('editor.openBlocksPanel')}
        </button>
      )}
      {isOverlay && isOpen && (
        <div
          aria-hidden="true"
          className="lg:hidden absolute inset-0 z-20 bg-black/30"
          onClick={() => closePanel(true)}
        />
      )}
      <aside
        ref={asideRef}
        id="editor-left-sidebar"
        aria-label={t('editor.components')}
        className={`w-48 lg:w-56 xl:w-64 bg-surface-card/80 backdrop-blur-2xl border-r border-default/15 flex flex-col shrink-0 z-20 max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-72 max-lg:max-w-[85%] max-lg:bg-surface-card max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200 ${
          isHidden ? 'max-lg:-translate-x-full max-lg:invisible' : ''
        }`}
      >
        <div className="p-4 border-b border-default/15 shrink-0 flex items-center gap-2">
          <div role="tablist" aria-label={t('editor.sidebarSections')} onKeyDown={handleTabsKeyDown} className="flex-1 min-w-0 flex bg-surface-elevated/80 p-1 rounded-lg border border-default/10 shadow-inner">
            <button
              id="tab-components"
              role="tab"
              aria-selected={leftTab === 'components'}
              aria-controls="tabpanel-components"
              tabIndex={leftTab === 'components' ? 0 : -1}
              onClick={() => setLeftTab('components')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 pointer-coarse:min-h-11 rounded-md text-[10px] font-bold uppercase tracking-normal transition-all ${
                leftTab === 'components'
                  ? 'bg-surface-card text-primary shadow-sm border border-default/30'
                  : 'text-muted hover:text-secondary hover:bg-surface-card/30 border border-transparent'
              }`}
            >
              <BoxSelect aria-hidden="true" className="w-3.5 h-3.5 shrink-0 max-xl:hidden" /> <span className="truncate">{t('editor.components')}</span>
            </button>
            <button
              id="tab-layers"
              role="tab"
              aria-selected={leftTab === 'layers'}
              aria-controls="tabpanel-layers"
              tabIndex={leftTab === 'layers' ? 0 : -1}
              onClick={() => setLeftTab('layers')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 pointer-coarse:min-h-11 rounded-md text-[10px] font-bold uppercase tracking-normal transition-all ${
                leftTab === 'layers'
                  ? 'bg-surface-card text-primary shadow-sm border border-default/30'
                  : 'text-muted hover:text-secondary hover:bg-surface-card/30 border border-transparent'
              }`}
            >
              <Layers aria-hidden="true" className="w-3.5 h-3.5 shrink-0 max-xl:hidden" /> <span className="truncate">{t('editor.layers')}</span>
            </button>
          </div>
          {isOverlay && (
            <button
              type="button"
              onClick={() => closePanel(true)}
              aria-label={t('editor.closeBlocksPanel')}
              title={t('editor.closeBlocksPanel')}
              className="lg:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-elevated transition-colors"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          data-layers-scroll
          className="flex-1 overflow-y-auto custom-scrollbar p-4 xl:p-5"
        >
          {leftTab === 'components' && (
            <div role="tabpanel" id="tabpanel-components" aria-labelledby="tab-components" className="animate-in fade-in duration-200">
              <div className="relative mb-4">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={t('editor.searchComponents')}
                  aria-label={t('editor.searchComponents')}
                  className="bg-surface-elevated border border-default/10 rounded-lg px-3 py-1.5 pointer-coarse:min-h-11 pl-9 text-sm text-primary placeholder-muted w-full outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted mb-4 leading-relaxed">
                {t('editor.dragHint')}
              </p>
              {filteredBlocks.length === 0 && (
                <p className="text-sm text-muted text-center py-6">{t('editor.noResults')}</p>
              )}
              {/* Tiles are touch-pan-y: a finger moving up or down scrolls the list; sideways or held, it drags (lib/touch-drag) */}
              <div role="list" className="grid grid-cols-2 gap-2.5">
                {filteredBlocks.map((b) => {
                  const IconComponent = b.icon;
                  return (
                    <div role="listitem" key={b.type} className="flex min-w-0">
                    <button
                      type="button"
                      title={b.label}
                      onPointerDown={(e) => handleComponentPointerDown(e, b.type, b.label, getBlockDefaults(b.type, locale))}
                      onClick={() => handleComponentClick(b.type, b.label)}
                      className="w-full min-w-0 flex flex-col items-center gap-2 p-2 xl:p-3 rounded-lg border border-default/10 bg-surface-elevated/50 hover:bg-surface-card hover:border-default/30 transition-all group text-left cursor-grab active:cursor-grabbing touch-pan-y select-none [-webkit-touch-callout:none]"
                    >
                      <div className="w-10 h-10 rounded-lg bg-surface-card flex items-center justify-center text-secondary group-hover:text-primary-color group-hover:bg-primary/10 transition-colors">
                        <IconComponent aria-hidden="true" className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] leading-tight font-medium text-secondary group-hover:text-primary text-center line-clamp-2 hyphens-auto w-full">
                        {b.label}
                      </span>
                    </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {leftTab === 'layers' && (
            <div role="tabpanel" id="tabpanel-layers" aria-labelledby="tab-layers" data-layers-container ref={layersRef} onKeyDown={handleLayersKeyDown} className="space-y-0.5 animate-in fade-in duration-200">
              <div role="list">
              {page.blocks.map((block, index) => {
                const isLayerDragOver = layerDropIndex === index;
                const BlockIcon = blockRegistry[block.type]?.icon || Layout;
                const lock = blockLocks[block.id];
                // Held by another connection (another person, or this person in another tab), like the canvas shows
                const lockedBy = lock && lock.connectionId !== myConnectionId ? lock : null;
                const isBeingDragged =
                  isDragging &&
                  dragSource?.action === 'reorder' &&
                  dragSource.sourceIndex === index;

                return (
                  <div
                    role="listitem"
                    key={block.id}
                    data-layer-index={index}
                    data-layer-item
                    data-block-id={block.id}
                    aria-current={selectedBlockId === block.id ? 'true' : undefined}
                    tabIndex={0}
                    onPointerDown={(e) => handleLayerPointerDown(e, index, block)}
                    onClick={() => {
                      if (!isDragging && !dragEndedRecently()) selectLayer(block.id);
                    }}
                    style={{ opacity: isBeingDragged ? 0.3 : 1 }}
                    className={`flex items-center gap-2.5 p-2 pointer-coarse:min-h-11 rounded-md cursor-grab active:cursor-grabbing text-sm border transition-all select-none touch-pan-y [-webkit-touch-callout:none] ${
                      selectedBlockId === block.id
                        ? 'bg-primary/10 border-primary/30 text-primary-color'
                        : 'border-transparent text-secondary hover:bg-surface-elevated hover:text-primary'
                    } ${isLayerDragOver ? 'border-t-primary bg-primary/5' : ''}`}
                  >
                    <GripVertical
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 ${
                        selectedBlockId === block.id ? 'text-primary-color/70' : 'text-muted'
                      }`}
                    />
                    <BlockIcon aria-hidden="true" className="w-3.5 h-3.5 opacity-70" />
                    <span className="truncate flex-1 select-none font-medium text-[13px]">
                      {getTranslatedBlockLabel(block.type, t, block.name)}
                    </span>
                    {lockedBy && (
                      <span className="flex items-center shrink-0 text-warning" title={t('a11y.blockStateLocked', { user: lockedBy.username })}>
                        <Lock aria-hidden="true" className="w-3.5 h-3.5" />
                        <span className="sr-only">{t('a11y.blockStateLocked', { user: lockedBy.username })}</span>
                      </span>
                    )}
                  </div>
                );
              })}
              </div>
              {page.blocks.length > 0 && (
                <div
                  data-layer-index={page.blocks.length}
                  className={`h-4 rounded-md transition-colors border-2 border-dashed mt-2 ${
                    layerDropIndex === page.blocks.length
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent'
                  }`}
                />
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

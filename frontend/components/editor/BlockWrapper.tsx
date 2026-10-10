'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical, Copy, Trash2, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore, getUserColor } from '@/store/editor-store';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { isTextEntryTarget } from '@/lib/keyboard';
import { useRemoveFromTabOrder } from '@/hooks/useRemoveFromTabOrder';
import type { Block } from '@/types/blocks';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import AIBlockEditPopover from './AIBlockEditPopover';

interface BlockWrapperProps {
  block: Block;
  index: number;
  /** The one block of the canvas that is in the tab order (roving tabindex). */
  isTabStop?: boolean;
  /** Called when the block itself takes focus, so the tab stop follows the user. */
  onFocusBlock?: (blockId: string) => void;
  children: React.ReactNode;
}

const REVEAL_MARGIN = 24; // px kept between a focused block and the viewport edge

/**
 * Brings a keyboard-focused block into view. The canvas is panned with
 * viewportState, not scrolled, so the offset the browser adds to the
 * overflow:hidden viewport when focusing is undone and replaced by a pan.
 */
function revealInViewport(el: HTMLElement) {
  const viewport = el.closest<HTMLElement>('[data-canvas-viewport]');
  if (!viewport) return;
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
  const view = viewport.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let dy = 0;
  if (box.top < view.top + REVEAL_MARGIN) {
    dy = view.top + REVEAL_MARGIN - box.top;
  } else if (box.bottom > view.bottom - REVEAL_MARGIN) {
    // Never push the top of a tall block out of view
    dy = Math.max(view.bottom - REVEAL_MARGIN - box.bottom, view.top + REVEAL_MARGIN - box.top);
  }
  if (dy !== 0) useEditorStore.getState().setViewportState((prev) => ({ ...prev, y: prev.y + dy }));
}

function focusBlockAt(position: number) {
  const target = useEditorStore.getState().page.blocks[position];
  if (!target) return;
  const el = document.getElementById(`block-focus-${target.id}`);
  if (!el) return;
  el.focus({ preventScroll: true });
  revealInViewport(el);
}

export default function BlockWrapper({ block, index, isTabStop = true, onFocusBlock, children }: BlockWrapperProps) {
  const t = useTranslations();
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const canvasDropIndex = useEditorStore((s) => s.canvasDropIndex);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const interactionState = useEditorStore((s) => s.interactionState);
  const blocksLength = useEditorStore((s) => s.page.blocks.length);
  const isDragging = useEditorStore((s) => s.isDragging);
  const dragSource = useEditorStore((s) => s.dragSource);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const requestDeleteBlock = useEditorStore((s) => s.requestDeleteBlock);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);
  const moveBlockUp = useEditorStore((s) => s.moveBlockUp);
  const moveBlockDown = useEditorStore((s) => s.moveBlockDown);
  const initDrag = useEditorStore((s) => s.initDrag);
  const lockHolder = useEditorStore((s) => s.blockLocks[block.id]);
  const myConnectionId = useEditorStore((s) => s.myConnectionId);
  const myUserId = useEditorStore((s) => s.myUserId);
  const pageId = useEditorStore((s) => s.page.id);
  // Held by another connection: another person, or this person in another tab
  const lockedByOther = lockHolder && lockHolder.connectionId !== myConnectionId ? lockHolder : null;
  const isLockedByOther = !!lockedByOther;
  const [showAIEdit, setShowAIEdit] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const focusRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const announceFlip = useRef(false);
  const refocusAfterMove = useRef(false);
  const focusFromPointer = useRef(false);
  useRemoveFromTabOrder(contentRef, !isPreviewMode);

  // The block moved: React may have re-inserted its node, which drops focus
  useEffect(() => {
    if (!refocusAfterMove.current) return;
    refocusAfterMove.current = false;
    const el = focusRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    revealInViewport(el);
  }, [index]);

  // Color for the user who has this block selected/locked
  const myColor = myUserId ? getUserColor(myUserId) : null;
  const otherColor = lockedByOther ? getUserColor(lockedByOther.userId) : null;

  if (isPreviewMode) {
    return (
      <div id={`block-wrapper-${block.id}`} className="relative w-full">
        {children}
      </div>
    );
  }

  const isSelected = selectedBlockId === block.id;
  const isBeingDragged =
    isDragging &&
    dragSource?.action === 'reorder' &&
    dragSource.sourceIndex === index;

  const blockLabel = getTranslatedBlockLabel(block.type, t, block.name);
  const ariaLabel = [
    t('a11y.blockAria', { name: blockLabel, position: index + 1, total: blocksLength }),
    isSelected ? t('a11y.blockStateSelected') : null,
    lockedByOther ? t('a11y.blockStateLocked', { user: lockedByOther.username }) : null,
  ].filter(Boolean).join(', ');

  // Live-region text; flipping a trailing space makes a repeated message announce again
  const announce = (message: string) => {
    announceFlip.current = !announceFlip.current;
    setAnnouncement(announceFlip.current ? message : `${message}\u00a0`);
  };

  /** Mouse and keyboard are refused the same way when another person holds the block. */
  const refuseLocked = () => {
    if (!lockedByOther) return false;
    announce(t('a11y.blockLockedRefused', { name: blockLabel, user: lockedByOther.username }));
    return true;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (interactionState.isSpacePressed) return;
    if (e.button !== 0) return; // left click only
    initDrag(
      { action: 'reorder', type: block.type, label: blockLabel, sourceIndex: index },
      { x: e.clientX, y: e.clientY }
    );
  };

  const moveBy = (direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocksLength) return;
    refocusAfterMove.current = true;
    if (direction === -1) moveBlockUp(block.id);
    else moveBlockDown(block.id);
    announce(t('a11y.blockMoved', { name: blockLabel, position: target + 1, total: blocksLength }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      // From the toolbar or a popover inside the block. Typing keeps its keys.
      if (e.key === 'Escape' && isSelected && !showAIEdit && !isTextEntryTarget(e.target)) {
        e.stopPropagation();
        focusRef.current?.focus({ preventScroll: true });
        selectBlock(null);
        announce(t('a11y.selectionCleared'));
      }
      return;
    }

    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    const modKey = e.ctrlKey || e.metaKey;

    // After a click, Space stays the canvas pan key (hold Space and drag)
    const isSpaceForPan = e.key === ' ' && focusFromPointer.current;
    if (plain && (e.key === 'Enter' || e.key === ' ') && !isSpaceForPan) {
      e.preventDefault();
      e.stopPropagation(); // Space must select here, not start a canvas pan
      if (refuseLocked()) return;
      selectBlock(block.id);
      announce(t('a11y.blockSelected', { name: blockLabel }));
      return;
    }

    if (plain && e.key === 'Escape') {
      if (!isSelected) return;
      e.stopPropagation();
      selectBlock(null);
      announce(t('a11y.selectionCleared'));
      return;
    }

    if (plain && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      if (e.key === 'ArrowUp') focusBlockAt(index - 1);
      else if (e.key === 'ArrowDown') focusBlockAt(index + 1);
      else if (e.key === 'Home') focusBlockAt(0);
      else focusBlockAt(blocksLength - 1);
      return;
    }

    if (e.altKey && !modKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      if (refuseLocked()) return;
      moveBy(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (modKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault(); // the browser would bookmark the page
      e.stopPropagation();
      if (refuseLocked()) return;
      duplicateBlock(block.id);
      announce(t('a11y.blockDuplicated', { name: blockLabel }));
      return;
    }

    if (plain && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      e.stopPropagation(); // the editor-wide handler would act on the selected block instead
      if (refuseLocked()) return;
      requestDeleteBlock(block.id);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    onFocusBlock?.(block.id);
    if (focusFromPointer.current) return; // a click already put the block in view
    revealInViewport(e.currentTarget);
  };

  return (
    <div
      id={`block-wrapper-${block.id}`}
      data-block-index={index}
      className="relative w-full animate-block-enter"
    >
      {/* Drop indicator top */}
      {canvasDropIndex === index && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary animate-drop-pulse z-50">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,207,252,1)]" />
        </div>
      )}
      {/* Drop indicator bottom (last block) */}
      {canvasDropIndex === blocksLength && index === blocksLength - 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary animate-drop-pulse z-50">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,207,252,1)]" />
        </div>
      )}

      <div
        ref={focusRef}
        id={`block-focus-${block.id}`}
        data-block-focusable=""
        role="group"
        aria-label={ariaLabel}
        tabIndex={isTabStop ? 0 : -1}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => { focusFromPointer.current = false; }}
        onPointerDownCapture={() => { focusFromPointer.current = true; }}
        className={`group relative outline outline-2 outline-offset-[3px] transition-all duration-200 rounded-sm ${
          isLockedByOther || isSelected ? 'z-10' : 'hover:z-0'
        } ${interactionState.isSpacePressed || isLockedByOther ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          opacity: isBeingDragged ? 0.3 : 1,
          transition: 'opacity 0.2s ease',
          outlineColor: isLockedByOther && otherColor
            ? `${otherColor.hex}99`
            : isSelected && myColor
              ? myColor.hex
              : 'transparent',
        }}
        onPointerDown={isLockedByOther ? undefined : handlePointerDown}
        onClick={(e) => {
          e.stopPropagation();
          if (interactionState.isSpacePressed || isDragging) return;
          if (!refuseLocked()) selectBlock(block.id);
        }}
      >
        {/* Keyboard focus ring: inside the block, because the canvas frame clips anything outside it */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-sm border-2 border-transparent opacity-0 shadow-[inset_0_0_0_3px_var(--bp-color-primary),inset_0_0_0_5px_#fff] group-focus-visible:opacity-100"
        />

        {/* Floating tooltips are editor UI inside the themed canvas: they keep the app font */}
        {/* Floating tooltip — locked by other user */}
        {isLockedByOther && (
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 text-white text-[11px] font-(family-name:--font-dm-sans) font-medium whitespace-nowrap rounded-full shadow-lg z-30 flex items-center opacity-100 scale-100"
            style={{ backgroundColor: otherColor ? `${otherColor.hex}` : '#f59e0b' }}
          >
            <div className="px-3 h-full flex items-center gap-1.5 rounded-full">
              <Lock className="w-3 h-3 opacity-70" />
              <span className="tracking-wide">{blockLabel}</span>
              <span className="text-white/60">— {lockedByOther.username}</span>
            </div>
          </div>
        )}

        {/* Floating tooltip — own selection / hover */}
        {!isLockedByOther && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 text-white text-[11px] font-(family-name:--font-dm-sans) font-medium whitespace-nowrap rounded-full shadow-lg z-30 flex items-center transition-all duration-200 ${
              isSelected && !interactionState.isSpacePressed && !isDragging
                ? 'opacity-100 scale-100'
                : isDragging
                  ? 'opacity-0 scale-95 pointer-events-none'
                  : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100'
            }`}
            style={{ backgroundColor: myColor?.hex || '#2563EB' }}
          >
            <div className="px-3 h-full flex items-center gap-1.5 rounded-l-full transition-colors cursor-grab active:cursor-grabbing hover:brightness-110">
              <GripVertical className="w-3.5 h-3.5 opacity-60" />
              <span className="tracking-wide">{blockLabel}</span>
            </div>
            {isSelected && (
              <div className="h-full py-1.5 flex items-center">
                <div className="w-[1px] h-full bg-white/20" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAIEdit(true);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={t('ai.title')}
                  className="px-2.5 h-full hover:text-violet-300 transition-colors flex items-center justify-center cursor-pointer border-r border-white/20"
                  title={t('ai.title')}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateBlock(block.id);
                  }}
                  aria-label={t('common.duplicate')}
                  className="px-2.5 h-full hover:text-white/80 transition-colors flex items-center justify-center cursor-pointer border-r border-white/20"
                  title={t('common.duplicate')}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteBlock(block.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={t('common.delete')}
                  className="px-2.5 h-full hover:text-red-300 transition-colors flex items-center justify-center cursor-pointer rounded-r-full"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI Edit Popover */}
        {showAIEdit && isSelected && (
          <AIBlockEditPopover
            blockId={block.id}
            pageId={pageId}
            onClose={() => setShowAIEdit(false)}
          />
        )}

        <div
          ref={contentRef}
          className={`${isSelected ? 'opacity-100' : 'opacity-95 group-hover:opacity-100 transition-opacity'} ${isLockedByOther ? 'pointer-events-none opacity-70' : ''}`}
        >
          {children}
        </div>
      </div>
      <p role="status" className="sr-only">{announcement}</p>
    </div>
  );
}

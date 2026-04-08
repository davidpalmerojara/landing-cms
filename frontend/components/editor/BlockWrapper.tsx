'use client';

import { useState } from 'react';
import { GripVertical, Copy, Trash2, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore, getUserColor } from '@/store/editor-store';
import type { Block } from '@/types/blocks';
import AIBlockEditPopover from './AIBlockEditPopover';

interface BlockWrapperProps {
  block: Block;
  index: number;
  children: React.ReactNode;
}

export default function BlockWrapper({ block, index, children }: BlockWrapperProps) {
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
  const initDrag = useEditorStore((s) => s.initDrag);
  const lockHolder = useEditorStore((s) => s.blockLocks[block.id]);
  const connectedUsers = useEditorStore((s) => s.connectedUsers);
  const myUserId = useEditorStore((s) => s.myUserId);
  const pageId = useEditorStore((s) => s.page.id);
  const lockedByOther = lockHolder && lockHolder !== myUserId && connectedUsers.find((u) => u.id === lockHolder);
  const isLockedByOther = !!lockedByOther;
  const [showAIEdit, setShowAIEdit] = useState(false);

  // Color for the user who has this block selected/locked
  const myColor = myUserId ? getUserColor(myUserId) : null;
  const otherColor = lockedByOther ? getUserColor(lockedByOther.id) : null;

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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (interactionState.isSpacePressed) return;
    if (e.button !== 0) return; // left click only
    initDrag(
      { action: 'reorder', type: block.type, label: block.name, sourceIndex: index },
      { x: e.clientX, y: e.clientY }
    );
  };

  return (
    <div
      id={`block-wrapper-${block.id}`}
      data-block-index={index}
      role="region"
      aria-label={block.name || block.type}
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
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2563EB] animate-drop-pulse z-50">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-[#2563EB] rounded-full shadow-[0_0_10px_rgba(0,207,252,1)]" />
        </div>
      )}

      <div
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
          if (!interactionState.isSpacePressed && !isDragging && !isLockedByOther) selectBlock(block.id);
        }}
      >
        {/* Floating tooltip — locked by other user */}
        {isLockedByOther && (
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 text-white text-[11px] font-medium rounded-full shadow-lg z-30 flex items-center opacity-100 scale-100"
            style={{ backgroundColor: otherColor ? `${otherColor.hex}` : '#f59e0b' }}
          >
            <div className="px-3 h-full flex items-center gap-1.5 rounded-full">
              <Lock className="w-3 h-3 opacity-70" />
              <span className="tracking-wide">{block.name}</span>
              <span className="text-white/60">— {lockedByOther.username}</span>
            </div>
          </div>
        )}

        {/* Floating tooltip — own selection / hover */}
        {!isLockedByOther && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 text-white text-[11px] font-medium rounded-full shadow-lg z-30 flex items-center transition-all duration-200 ${
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
              <span className="tracking-wide">{block.name}</span>
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

        <div className={`${isSelected ? 'opacity-100' : 'opacity-95 group-hover:opacity-100 transition-opacity'} ${isLockedByOther ? 'pointer-events-none opacity-70' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

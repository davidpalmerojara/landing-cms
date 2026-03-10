'use client';

import { GripVertical, Copy, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import type { Block } from '@/types/blocks';

interface BlockWrapperProps {
  block: Block;
  index: number;
  children: React.ReactNode;
}

export default function BlockWrapper({ block, index, children }: BlockWrapperProps) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const canvasDropIndex = useEditorStore((s) => s.canvasDropIndex);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const interactionState = useEditorStore((s) => s.interactionState);
  const blocksLength = useEditorStore((s) => s.page.blocks.length);
  const isDragging = useEditorStore((s) => s.isDragging);
  const dragSource = useEditorStore((s) => s.dragSource);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const deleteBlock = useEditorStore((s) => s.deleteBlock);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);
  const initDrag = useEditorStore((s) => s.initDrag);

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
      className="relative w-full"
    >
      {/* Drop indicator top */}
      {canvasDropIndex === index && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] z-50">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,1)]" />
        </div>
      )}
      {/* Drop indicator bottom (last block) */}
      {canvasDropIndex === blocksLength && index === blocksLength - 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] z-50">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,1)]" />
        </div>
      )}

      <div
        className={`group relative outline outline-2 outline-offset-[3px] transition-all duration-200 rounded-sm ${
          isSelected
            ? 'outline-indigo-500 z-10'
            : 'outline-transparent hover:outline-indigo-400/40 hover:z-0'
        } ${interactionState.isSpacePressed ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ opacity: isBeingDragged ? 0.3 : 1 }}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          e.stopPropagation();
          if (!interactionState.isSpacePressed && !isDragging) selectBlock(block.id);
        }}
      >
        {/* Floating tooltip */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 -top-3.5 h-7 bg-indigo-600 text-white text-[11px] font-medium rounded-full shadow-lg z-30 flex items-center transition-all duration-200 ${
            isSelected && !interactionState.isSpacePressed && !isDragging
              ? 'opacity-100 scale-100'
              : isDragging
                ? 'opacity-0 scale-95 pointer-events-none'
                : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100'
          }`}
        >
          <div className="px-3 h-full flex items-center gap-1.5 hover:bg-indigo-700 rounded-l-full transition-colors cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5 opacity-60" />
            <span className="tracking-wide">{block.name}</span>
          </div>
          {isSelected && (
            <div className="h-full py-1.5 flex items-center">
              <div className="w-[1px] h-full bg-indigo-500/50" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateBlock(block.id);
                }}
                className="px-2.5 h-full hover:text-indigo-200 transition-colors flex items-center justify-center cursor-pointer border-r border-indigo-500/50"
                title="Duplicar bloque"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBlock(block.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-2.5 h-full hover:text-red-300 transition-colors flex items-center justify-center cursor-pointer rounded-r-full"
                title="Eliminar bloque"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className={isSelected ? 'opacity-100' : 'opacity-95 group-hover:opacity-100 transition-opacity'}>
          {children}
        </div>
      </div>
    </div>
  );
}

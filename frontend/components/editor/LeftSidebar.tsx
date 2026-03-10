'use client';

import { useRef } from 'react';
import { BoxSelect, Layers, GripVertical, Layout } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { useAutoScroll } from '@/hooks/useAutoScroll';

export default function LeftSidebar() {
  const leftTab = useEditorStore((s) => s.leftTab);
  const setLeftTab = useEditorStore((s) => s.setLeftTab);
  const page = useEditorStore((s) => s.page);
  const dragOverIndex = useEditorStore((s) => s.dragOverIndex);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const addBlock = useEditorStore((s) => s.addBlock);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const onDragStartGlobal = useEditorStore((s) => s.onDragStartGlobal);
  const onDragEndGlobal = useEditorStore((s) => s.onDragEndGlobal);
  const setDragOverIndex = useEditorStore((s) => s.setDragOverIndex);
  const performDrop = useEditorStore((s) => s.performDrop);
  const draggedIndex = useEditorStore((s) => s.draggedIndex);

  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const availableBlocks = getAvailableBlocks();
  const { handleAutoScroll, stopAutoScroll } = useAutoScroll();

  const handleLayerDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    performDrop(
      e.dataTransfer.getData('action'),
      e.dataTransfer.getData('type'),
      e.dataTransfer.getData('label'),
      draggedIndex,
      dropIndex
    );
  };

  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col shrink-0 z-20">
      <div className="p-4 border-b border-zinc-800/80 shrink-0">
        <div className="flex bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/50 shadow-inner">
          <button
            onClick={() => setLeftTab('components')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              leftTab === 'components'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 border border-transparent'
            }`}
          >
            <BoxSelect className="w-3.5 h-3.5" /> Componentes
          </button>
          <button
            onClick={() => setLeftTab('layers')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              leftTab === 'layers'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Capas
          </button>
        </div>
      </div>

      <div
        ref={sidebarScrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-5"
        onDragOver={(e) => {
          e.preventDefault();
          handleAutoScroll(e, sidebarScrollRef);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverIndex(null);
            stopAutoScroll();
          }
        }}
      >
        {leftTab === 'components' && (
          <div className="animate-in fade-in duration-200">
            <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed">
              Arrastra los componentes al lienzo para construir tu landing page.
            </p>
            <div className="grid gap-2.5">
              {availableBlocks.map((b) => {
                const IconComponent = b.icon;
                return (
                  <button
                    key={b.type}
                    draggable
                    onDragStart={(e) => {
                      onDragStartGlobal();
                      e.dataTransfer.setData('action', 'add');
                      e.dataTransfer.setData('type', b.type);
                      e.dataTransfer.setData('label', b.label);
                    }}
                    onDragEnd={() => { onDragEndGlobal(); stopAutoScroll(); }}
                    onClick={() => addBlock(b.type, b.label)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all group text-left cursor-grab active:cursor-grabbing"
                  >
                    <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100">
                      {b.label}
                    </span>
                    <GripVertical className="w-4 h-4 ml-auto text-zinc-600 group-hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {leftTab === 'layers' && (
          <div className="space-y-0.5 animate-in fade-in duration-200">
            {page.blocks.map((block, index) => {
              const isDragOver = dragOverIndex === index;
              const BlockIcon = blockRegistry[block.type]?.icon || Layout;
              return (
                <div
                  key={block.id}
                  draggable
                  onDragStart={(e) => {
                    onDragStartGlobal(index);
                    e.dataTransfer.setData('action', 'reorder');
                    setTimeout(() => {
                      (e.target as HTMLElement).style.opacity = '0.3';
                    }, 0);
                  }}
                  onDragEnd={(e) => {
                    onDragEndGlobal();
                    stopAutoScroll();
                    (e.target as HTMLElement).style.opacity = '1';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => handleLayerDrop(e, index)}
                  onClick={() => selectBlock(block.id)}
                  className={`flex items-center gap-2.5 p-2 rounded-md cursor-grab active:cursor-grabbing text-sm border transition-all ${
                    selectedBlockId === block.id
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                      : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  } ${isDragOver ? 'border-t-indigo-500 bg-indigo-500/5' : ''}`}
                >
                  <GripVertical
                    className={`w-3.5 h-3.5 ${
                      selectedBlockId === block.id ? 'text-indigo-400/70' : 'text-zinc-600'
                    }`}
                  />
                  <BlockIcon className="w-3.5 h-3.5 opacity-70" />
                  <span className="truncate flex-1 select-none font-medium text-[13px]">
                    {block.name}
                  </span>
                </div>
              );
            })}
            {page.blocks.length > 0 && (
              <div
                className={`h-4 rounded-md transition-colors border-2 border-dashed mt-2 ${
                  dragOverIndex === page.blocks.length
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-transparent'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(page.blocks.length);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleLayerDrop(e, page.blocks.length)}
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

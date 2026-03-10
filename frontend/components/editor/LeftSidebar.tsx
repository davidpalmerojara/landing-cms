'use client';

import { BoxSelect, Layers, GripVertical, Layout } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';

export default function LeftSidebar() {
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

  const availableBlocks = getAvailableBlocks();

  const handleComponentPointerDown = (
    e: React.PointerEvent,
    type: string,
    label: string
  ) => {
    if (e.button !== 0) return;
    initDrag(
      { action: 'add', type, label, sourceIndex: null },
      { x: e.clientX, y: e.clientY }
    );
  };

  const handleLayerPointerDown = (
    e: React.PointerEvent,
    index: number,
    block: { type: string; name: string }
  ) => {
    if (e.button !== 0) return;
    initDrag(
      { action: 'reorder', type: block.type, label: block.name, sourceIndex: index },
      { x: e.clientX, y: e.clientY }
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
        data-layers-scroll
        className="flex-1 overflow-y-auto custom-scrollbar p-5"
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
                    onPointerDown={(e) => handleComponentPointerDown(e, b.type, b.label)}
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
          <div data-layers-container className="space-y-0.5 animate-in fade-in duration-200">
            {page.blocks.map((block, index) => {
              const isLayerDragOver = layerDropIndex === index;
              const BlockIcon = blockRegistry[block.type]?.icon || Layout;
              const isBeingDragged =
                isDragging &&
                dragSource?.action === 'reorder' &&
                dragSource.sourceIndex === index;

              return (
                <div
                  key={block.id}
                  data-layer-index={index}
                  onPointerDown={(e) => handleLayerPointerDown(e, index, block)}
                  onClick={() => {
                    if (!isDragging) selectBlock(block.id);
                  }}
                  style={{ opacity: isBeingDragged ? 0.3 : 1 }}
                  className={`flex items-center gap-2.5 p-2 rounded-md cursor-grab active:cursor-grabbing text-sm border transition-all select-none ${
                    selectedBlockId === block.id
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                      : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  } ${isLayerDragOver ? 'border-t-indigo-500 bg-indigo-500/5' : ''}`}
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
                data-layer-index={page.blocks.length}
                className={`h-4 rounded-md transition-colors border-2 border-dashed mt-2 ${
                  layerDropIndex === page.blocks.length
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-transparent'
                }`}
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

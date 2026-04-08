'use client';

import { useCallback, useRef, useState } from 'react';
import { BoxSelect, Layers, GripVertical, Layout, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';

export default function LeftSidebar() {
  const t = useTranslations();
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

  const [searchText, setSearchText] = useState('');
  const availableBlocks = getAvailableBlocks().map((block) => ({
    ...block,
    label: getTranslatedBlockLabel(block.type, t, block.label),
  }));
  const layersRef = useRef<HTMLDivElement>(null);

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
        if (blockId) selectBlock(blockId);
      }
    }
  }, [selectBlock]);

  const filteredBlocks = searchText.trim()
    ? availableBlocks.filter((b) => {
        const q = searchText.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.type.toLowerCase().includes(q);
      })
    : availableBlocks;

  const handleComponentPointerDown = (
    e: React.PointerEvent,
    type: string,
    label: string,
    initialData: Record<string, unknown>
  ) => {
    if (e.button !== 0) return;
    initDrag(
      { action: 'add', type, label, sourceIndex: null, initialData },
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
    <aside aria-label={t('editor.components')} className="w-48 lg:w-56 xl:w-64 bg-surface-card\/80 backdrop-blur-2xl border-r border-default/15 flex flex-col shrink-0 z-20">
      <div className="p-4 border-b border-default/15 shrink-0">
        <div role="tablist" aria-label={t('editor.currentView')} className="flex bg-surface-elevated\/80 p-1 rounded-lg border border-default/10 shadow-inner">
          <button
            id="tab-components"
            role="tab"
            aria-selected={leftTab === 'components'}
            aria-controls="tabpanel-components"
            onClick={() => setLeftTab('components')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              leftTab === 'components'
                ? 'bg-surface-card text-primary shadow-sm border border-default/30'
                : 'text-muted hover:text-secondary hover:bg-surface-card\/30 border border-transparent'
            }`}
          >
            <BoxSelect className="w-3.5 h-3.5" /> {t('editor.components')}
          </button>
          <button
            id="tab-layers"
            role="tab"
            aria-selected={leftTab === 'layers'}
            aria-controls="tabpanel-layers"
            onClick={() => setLeftTab('layers')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              leftTab === 'layers'
                ? 'bg-surface-card text-primary shadow-sm border border-default/30'
                : 'text-muted hover:text-secondary hover:bg-surface-card\/30 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> {t('editor.layers')}
          </button>
        </div>
      </div>

      <div
        data-layers-scroll
        className="flex-1 overflow-y-auto custom-scrollbar p-5"
      >
        {leftTab === 'components' && (
          <div role="tabpanel" id="tabpanel-components" aria-labelledby="tab-components" className="animate-in fade-in duration-200">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t('editor.searchComponents')}
                className="bg-surface-elevated border border-default/10 rounded-lg px-3 py-1.5 pl-9 text-sm text-primary placeholder-muted w-full outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <p className="text-[11px] text-muted mb-4 leading-relaxed">
              {t('editor.dragHint')}
            </p>
            {filteredBlocks.length === 0 && (
              <p className="text-sm text-muted text-center py-6">{t('editor.noResults')}</p>
            )}
            <div role="list" className="grid grid-cols-2 gap-2.5">
              {filteredBlocks.map((b) => {
                const IconComponent = b.icon;
                return (
                  <button
                    role="listitem"
                    key={b.type}
                    onPointerDown={(e) => handleComponentPointerDown(e, b.type, b.label, b.initialData)}
                    onClick={() => addBlock(b.type, b.label, null, b.initialData)}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-default/10 bg-surface-elevated\/50 hover:bg-surface-card hover:border-default/30 transition-all group text-left cursor-grab active:cursor-grabbing"
                  >
                    <div className="w-10 h-10 rounded-lg bg-surface-card flex items-center justify-center text-secondary group-hover:text-primary-color group-hover:bg-primary\/10 transition-colors">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-medium text-secondary group-hover:text-primary text-center truncate w-full">
                      {b.label}
                    </span>
                  </button>
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
                  tabIndex={0}
                  onPointerDown={(e) => handleLayerPointerDown(e, index, block)}
                  onClick={() => {
                    if (!isDragging) selectBlock(block.id);
                  }}
                  style={{ opacity: isBeingDragged ? 0.3 : 1 }}
                  className={`flex items-center gap-2.5 p-2 rounded-md cursor-grab active:cursor-grabbing text-sm border transition-all select-none ${
                    selectedBlockId === block.id
                      ? 'bg-primary\/10 border-primary/30 text-primary-color'
                      : 'border-transparent text-secondary hover:bg-surface-elevated hover:text-primary'
                  } ${isLayerDragOver ? 'border-t-primary bg-primary/5' : ''}`}
                >
                  <GripVertical
                    className={`w-3.5 h-3.5 ${
                      selectedBlockId === block.id ? 'text-primary-color/70' : 'text-muted'
                    }`}
                  />
                  <BlockIcon className="w-3.5 h-3.5 opacity-70" />
                  <span className="truncate flex-1 select-none font-medium text-[13px]">
                    {getTranslatedBlockLabel(block.type, t, block.name)}
                  </span>
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
  );
}

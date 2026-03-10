'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Plus, Layers } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry } from '@/lib/block-registry';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import BrowserFrame from './BrowserFrame';
import BlockWrapper from './BlockWrapper';
import FloatingViewportControls from './FloatingViewportControls';

function getCanvasWidthNumber(deviceMode: string) {
  if (deviceMode === 'mobile') return 375;
  if (deviceMode === 'tablet') return 768;
  return 1024;
}

export default function CanvasViewport() {
  const page = useEditorStore((s) => s.page);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const viewportState = useEditorStore((s) => s.viewportState);
  const interactionState = useEditorStore((s) => s.interactionState);
  const canvasDropIndex = useEditorStore((s) => s.canvasDropIndex);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const setViewportState = useEditorStore((s) => s.setViewportState);
  const setInteractionState = useEditorStore((s) => s.setInteractionState);
  const setCanvasDropIndex = useEditorStore((s) => s.setCanvasDropIndex);
  const performDrop = useEditorStore((s) => s.performDrop);
  const isDragging = useEditorStore((s) => s.isDragging);
  const draggedIndex = useEditorStore((s) => s.draggedIndex);
  const onDragEndGlobal = useEditorStore((s) => s.onDragEndGlobal);

  const viewportRef = useRef<HTMLDivElement>(null);
  const browserFrameRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const { handleAutoScroll, stopAutoScroll } = useAutoScroll((deltaY: number) => {
    setViewportState((prev) => ({ ...prev, y: prev.y + deltaY }));
  });

  // --- Center canvas ---
  const handleCenterCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current.getBoundingClientRect();
    const frameWidth = browserFrameRef.current
      ? browserFrameRef.current.offsetWidth
      : getCanvasWidthNumber(deviceMode);
    const newX = (viewport.width - frameWidth) / 2;
    const newY = 60;
    setViewportState({ zoom: 1, x: newX, y: newY });
  }, [deviceMode, setViewportState]);

  useEffect(() => {
    handleCenterCanvas();
  }, [deviceMode, handleCenterCanvas]);

  // --- Space key for panning ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setInteractionState((prev) => ({ ...prev, isSpacePressed: true }));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setInteractionState({ isSpacePressed: false, isPanning: false, isMiddleClickPanning: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setInteractionState]);

  // --- Wheel zoom & pan (capture: true) ---
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const isOverViewport =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (isOverViewport || useEditorStore.getState().isDragging) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          setViewportState((prev) => {
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.min(Math.max(Math.round((prev.zoom + delta) * 10) / 10, 0.5), 2);
            if (newZoom === prev.zoom) return prev;
            const scaleRatio = newZoom / prev.zoom;
            const newX = cx - (cx - prev.x) * scaleRatio;
            const newY = cy - (cy - prev.y) * scaleRatio;
            return { zoom: newZoom, x: newX, y: newY };
          });
        } else {
          setViewportState((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [setViewportState]);

  // --- Pan handlers ---
  const handlePanStart = (e: React.MouseEvent) => {
    const state = useEditorStore.getState().interactionState;
    if (!state.isSpacePressed && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    setInteractionState((prev) => ({ ...prev, isPanning: true, isMiddleClickPanning: e.button === 1 }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanMove = (e: React.MouseEvent) => {
    const state = useEditorStore.getState().interactionState;
    if (!state.isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setViewportState((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePanEnd = () => {
    const state = useEditorStore.getState().interactionState;
    if (state.isPanning) {
      setInteractionState((prev) => ({ ...prev, isPanning: false, isMiddleClickPanning: false }));
    }
  };

  // --- Canvas drop ---
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetIndex = canvasDropIndex !== null ? canvasDropIndex : page.blocks.length;
    performDrop(
      e.dataTransfer.getData('action'),
      e.dataTransfer.getData('type'),
      e.dataTransfer.getData('label'),
      draggedIndex,
      targetIndex
    );
  };

  let cursorClass = '';
  if (interactionState.isPanning) cursorClass = 'cursor-grabbing';
  else if (interactionState.isSpacePressed) cursorClass = 'cursor-grab';

  return (
    <div
      ref={viewportRef}
      className={`flex-1 overflow-hidden relative bg-zinc-950 ${cursorClass}`}
      style={{
        backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
        backgroundSize: `${24 * viewportState.zoom}px ${24 * viewportState.zoom}px`,
        backgroundPosition: `${viewportState.x}px ${viewportState.y}px`,
      }}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
      onClick={() => {
        if (!interactionState.isPanning) selectBlock(null);
      }}
      onDragOver={
        !isPreviewMode
          ? (e) => {
              e.preventDefault();
              handleAutoScroll(e, viewportRef, true);
              if (page.blocks.length === 0) setCanvasDropIndex(0);
              else if (e.target === e.currentTarget && canvasDropIndex === null)
                setCanvasDropIndex(page.blocks.length);
            }
          : undefined
      }
      onDragLeave={
        !isPreviewMode
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setCanvasDropIndex(null);
                stopAutoScroll();
              }
            }
          : undefined
      }
      onDrop={!isPreviewMode ? (e) => { handleCanvasDrop(e); stopAutoScroll(); } : undefined}
    >
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${viewportState.x}px, ${viewportState.y}px) scale(${viewportState.zoom})`,
          transition: (interactionState.isPanning || isDragging) ? 'none' : 'transform 0.1s ease-out',
          pointerEvents:
            interactionState.isSpacePressed || interactionState.isMiddleClickPanning ? 'none' : 'auto',
        }}
      >
        <BrowserFrame ref={browserFrameRef}>
          {page.blocks.map((block, index) => {
            const BlockContentComponent = blockRegistry[block.type]?.component;
            if (!BlockContentComponent) return null;

            return (
              <BlockWrapper key={block.id} block={block} index={index}>
                <BlockContentComponent
                  data={block.data}
                  isMobile={deviceMode === 'mobile'}
                  isTablet={deviceMode === 'tablet'}
                  isPreviewMode={isPreviewMode}
                />
              </BlockWrapper>
            );
          })}

          {page.blocks.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-300 pointer-events-none mt-20">
              <div className="w-20 h-20 rounded-3xl bg-zinc-100 flex items-center justify-center mb-6">
                <Plus className="w-8 h-8 text-zinc-400" />
              </div>
              <p className="text-xl font-semibold text-zinc-800">Lienzo en blanco</p>
              <p className="text-sm text-zinc-500 mt-2">
                {isPreviewMode
                  ? 'Desactiva el modo preview para editar.'
                  : 'Arrastra componentes desde la izquierda'}
              </p>
            </div>
          )}
        </BrowserFrame>
      </div>

      <FloatingViewportControls onCenterCanvas={handleCenterCanvas} />

      {/* Drag ghost */}
      <div
        id="drag-ghost"
        className="fixed -top-[1000px] -left-[1000px] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl text-[12px] font-medium flex items-center gap-2 pointer-events-none z-[-1]"
      >
        <Layers className="w-4 h-4 opacity-70" />
        <span id="drag-ghost-text">Moviendo bloque</span>
      </div>
    </div>
  );
}

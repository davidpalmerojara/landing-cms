'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Layout } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { getAvailableBlocks } from '@/lib/block-registry';
import BlockContent from '@/components/blocks/BlockContent';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { getBlockDefaults } from '@/lib/block-defaults';
import { resolveStyles } from '@/types/blocks';
import { pageThemeVars } from '@/lib/page-theme';
import { CANVAS_SHORTCUT_KEYS, isKeyOperableTarget } from '@/lib/keyboard';
import { fitCanvas, stepZoom } from '@/lib/canvas-zoom';
import { useCanvasTouchGestures } from '@/hooks/useCanvasTouchGestures';
import BrowserFrame from './BrowserFrame';
import BlockWrapper from './BlockWrapper';
import FloatingViewportControls from './FloatingViewportControls';

const CURSOR_THROTTLE = 50; // ms between cursor sends

function RemoteCursors() {
  const cursorPositions = useEditorStore((s) => s.cursorPositions);
  const viewportState = useEditorStore((s) => s.viewportState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const cursors = Object.values(cursorPositions).filter(
    (c) => now - c.timestamp < 10_000 // Hide stale cursors (10s)
  );

  if (cursors.length === 0) return null;

  return (
    <>
      {cursors.map((cursor) => {
        // cursor.x/y are relative to the BrowserFrame content area
        // Convert to viewport-space: apply zoom + pan
        const screenX = cursor.x * viewportState.zoom + viewportState.x;
        const screenY = cursor.y * viewportState.zoom + viewportState.y;

        return (
          <div
            key={cursor.connectionId}
            aria-hidden="true"
            className="absolute pointer-events-none z-50 transition-all duration-100 ease-out"
            style={{ left: screenX, top: screenY }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.5))` }}
            >
              <path
                d="M0.5 0.5L15.5 11.5L8 12.5L5 19.5L0.5 0.5Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            {/* Username label */}
            <div
              className="absolute left-4 top-4 text-[10px] font-medium text-white px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-lg"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.username}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function CanvasViewport({ onCursorMove }: { onCursorMove?: (x: number, y: number) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const page = useEditorStore((s) => s.page);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const viewportState = useEditorStore((s) => s.viewportState);
  const interactionState = useEditorStore((s) => s.interactionState);
  const canvasDropIndex = useEditorStore((s) => s.canvasDropIndex);
  const isDragging = useEditorStore((s) => s.isDragging);
  const selectBlock = useEditorStore((s) => s.selectBlock);
  const addBlock = useEditorStore((s) => s.addBlock);
  const setViewportState = useEditorStore((s) => s.setViewportState);
  const setInteractionState = useEditorStore((s) => s.setInteractionState);

  const themeVars = useMemo(
    () => pageThemeVars(page.designTokens),
    [page.designTokens],
  );

  // Roving tabindex: the canvas is a single Tab stop, arrows move between blocks
  const [tabStopId, setTabStopId] = useState<string | null>(null);
  const tabStopBlockId = page.blocks.some((b) => b.id === tabStopId) ? tabStopId : (page.blocks[0]?.id ?? null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const browserFrameRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastCursorSendRef = useRef(0);

  // Track mouse and send cursor position to collaborators
  const handleCursorTracking = useCallback((e: React.MouseEvent) => {
    if (!onCursorMove) return;
    const now = Date.now();
    if (now - lastCursorSendRef.current < CURSOR_THROTTLE) return;
    lastCursorSendRef.current = now;

    const vs = useEditorStore.getState().viewportState;
    // Convert screen coords to canvas-relative coords (before zoom/pan)
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasX = (e.clientX - rect.left - vs.x) / vs.zoom;
    const canvasY = (e.clientY - rect.top - vs.y) / vs.zoom;
    onCursorMove(canvasX, canvasY);
  }, [onCursorMove]);

  // --- Center / fit canvas ---
  // The last state set by auto-fit. While the viewport still matches it the
  // user has not panned or zoomed, so a resize may re-fit the canvas.
  const autoFitRef = useRef<{ zoom: number; x: number; y: number } | null>(null);

  const handleCenterCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const next = fitCanvas(viewportRef.current.clientWidth, deviceMode);
    autoFitRef.current = next;
    setViewportState(next);
  }, [deviceMode, setViewportState]);

  useEffect(() => {
    handleCenterCanvas();
  }, [deviceMode, handleCenterCanvas]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const current = useEditorStore.getState().viewportState;
      const last = autoFitRef.current;
      const untouched = last && current.zoom === last.zoom && current.x === last.x && current.y === last.y;
      if (untouched) handleCenterCanvas();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleCenterCanvas]);

  // --- Space key for panning ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space belongs to fields, buttons, switches and focused blocks; it pans only from the page itself
      if (isKeyOperableTarget(e.target)) return;
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

  // --- Wheel zoom & pan ---
  // Listening on the viewport element (not window) means wheel events from
  // modals or panels drawn over the canvas keep scrolling those instead.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // non-passive: also blocks the browser's ctrl+wheel page zoom
      if (e.ctrlKey || e.metaKey) {
        const rect = viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setViewportState((prev) => stepZoom(prev, e.deltaY > 0 ? -1 : 1, cx, cy));
      } else {
        setViewportState((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [setViewportState]);

  // --- Touch: one finger pans, two fingers pinch, double tap edits text ---
  useCanvasTouchGestures(viewportRef);

  /** Zoom buttons zoom around the middle of the viewport. */
  const handleZoomStep = useCallback((direction: 1 | -1) => {
    const el = viewportRef.current;
    if (!el) return;
    setViewportState((prev) => stepZoom(prev, direction, el.clientWidth / 2, el.clientHeight / 2));
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

  // The viewport is `touch-none`: fingers pan and pinch the canvas (useCanvasTouchGestures), not the page
  let cursorClass = '';
  if (interactionState.isPanning) cursorClass = 'cursor-grabbing';
  else if (interactionState.isSpacePressed) cursorClass = 'cursor-grab';

  return (
    <div
      ref={viewportRef}
      data-canvas-viewport
      className={`flex-1 min-w-0 overflow-hidden relative bg-surface touch-none [-webkit-touch-callout:none] ${cursorClass}`}
      style={{
        backgroundImage: 'radial-gradient(var(--bp-color-border) 1px, transparent 1px)',
        backgroundSize: `${24 * viewportState.zoom}px ${24 * viewportState.zoom}px`,
        backgroundPosition: `${viewportState.x}px ${viewportState.y}px`,
      }}
      onMouseDown={handlePanStart}
      onMouseMove={(e) => { handlePanMove(e); handleCursorTracking(e); }}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
      onClick={() => {
        if (!interactionState.isPanning && !isDragging) selectBlock(null);
      }}
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
          <div
            className="@container"
            style={themeVars}
            role="group"
            aria-label={t('a11y.canvasLabel', { count: page.blocks.length })}
            aria-describedby={isPreviewMode ? undefined : 'canvas-keyboard-help'}
          >
          {!isPreviewMode && (
            <p id="canvas-keyboard-help" className="sr-only">
              {CANVAS_SHORTCUT_KEYS.map((key) => t(`a11y.${key}`)).join('. ')}
            </p>
          )}
          {page.blocks.map((block, index) => {
            const s = resolveStyles(block, deviceMode);
            const blockStyle: React.CSSProperties = {
              ...(s.paddingTop ? { paddingTop: s.paddingTop } : {}),
              ...(s.paddingBottom ? { paddingBottom: s.paddingBottom } : {}),
              ...(s.paddingLeft ? { paddingLeft: s.paddingLeft } : {}),
              ...(s.paddingRight ? { paddingRight: s.paddingRight } : {}),
              ...(s.marginTop ? { marginTop: s.marginTop } : {}),
              ...(s.marginBottom ? { marginBottom: s.marginBottom } : {}),
              ...(s.bgColor ? { backgroundColor: s.bgColor, '--block-bg': s.bgColor } as React.CSSProperties : {}),
              ...(s.borderRadius ? { borderRadius: s.borderRadius } : {}),
              ...(block.type !== 'navbar' ? { overflow: 'hidden' } : {}),
            };

            return (
              <BlockWrapper
                key={block.id}
                block={block}
                index={index}
                isTabStop={block.id === tabStopBlockId}
                onFocusBlock={setTabStopId}
              >
                <div style={blockStyle}>
                  <BlockContent block={block} isPreviewMode={isPreviewMode} />
                </div>
              </BlockWrapper>
            );
          })}

          {page.blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 pointer-events-auto">
              <Layout className="w-12 h-12 text-muted mb-4" />
              <p className="text-secondary font-medium mb-1">{t('mobile.emptyTitle')}</p>
              <p className="text-muted text-sm mb-6 text-center max-w-xs">
                {t('editor.dragHint')}
              </p>
              {!isPreviewMode && (
                <div className="flex gap-2">
                  {(['hero', 'features', 'cta'] as const).map((type) => {
                    const entry = getAvailableBlocks().find((b) => b.type === type);
                    if (!entry) return null;
                    const translatedLabel = getTranslatedBlockLabel(entry.type, t, entry.label);
                    return (
                      <button
                        key={type}
                        onClick={(e) => {
                          e.stopPropagation();
                          addBlock(entry.type, translatedLabel, null, getBlockDefaults(entry.type, locale));
                        }}
                        className="bg-surface-card hover:bg-[#333] text-secondary text-xs px-3 py-1.5 rounded-full transition-colors"
                      >
                        {translatedLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Canvas-level drop indicator when dropping at end */}
          {canvasDropIndex === page.blocks.length && page.blocks.length > 0 && (
            <div className="h-[2px] bg-primary shadow-[0_0_12px_rgba(0,207,252,0.8)] relative">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,207,252,1)]" />
            </div>
          )}
          </div>
        </BrowserFrame>
      </div>

      <RemoteCursors />
      <FloatingViewportControls onCenterCanvas={handleCenterCanvas} onZoomStep={handleZoomStep} />
    </div>
  );
}

'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Layout } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import type { CursorPosition } from '@/store/editor-store';
import { blockRegistry, getAvailableBlocks } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { defaultBlockStyles, resolveStyles } from '@/types/blocks';
import { getThemeById } from '@/lib/themes';
import { defaultDesignTokens, tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';
import BrowserFrame from './BrowserFrame';
import BlockWrapper from './BlockWrapper';
import FloatingViewportControls from './FloatingViewportControls';

function getCanvasWidthNumber(deviceMode: string) {
  if (deviceMode === 'mobile') return 375;
  if (deviceMode === 'tablet') return 768;
  return 1024;
}

const CURSOR_THROTTLE = 50; // ms between cursor sends

function RemoteCursors({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
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
            key={cursor.userId}
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

  const tokens = page.designTokens || defaultDesignTokens;
  const theme = useMemo(() => getThemeById(page.themeId || 'default', page.customTheme), [page.themeId, page.customTheme]);
  const themeVars = useMemo(() => {
    // Design tokens generate both --bp-* vars and backward-compat --theme-* vars
    const bpVars = tokensToCssVars(tokens);
    const legacyVars = tokensToThemeVars(tokens);
    // If no custom design tokens, fall back to the old theme system for legacy vars
    const fallbackThemeVars = page.designTokens ? {} : {
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
    return {
      ...bpVars,
      ...(page.designTokens ? legacyVars : fallbackThemeVars),
    } as React.CSSProperties;
  }, [tokens, theme, page.designTokens]);

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

  // --- Wheel zoom & pan ---
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const isOverViewport =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (isOverViewport) {
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

  let cursorClass = '';
  if (interactionState.isPanning) cursorClass = 'cursor-grabbing';
  else if (interactionState.isSpacePressed) cursorClass = 'cursor-grab';

  return (
    <div
      ref={viewportRef}
      data-canvas-viewport
      className={`flex-1 overflow-hidden relative bg-surface ${cursorClass}`}
      style={{
        backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)',
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
          <div style={themeVars}>
          {page.blocks.map((block, index) => {
            const BlockContentComponent = blockRegistry[block.type]?.component;
            if (!BlockContentComponent) return null;

            const s = resolveStyles(block, deviceMode);
            const blockStyle: React.CSSProperties = {
              ...(s.paddingTop ? { paddingTop: s.paddingTop } : {}),
              ...(s.paddingBottom ? { paddingBottom: s.paddingBottom } : {}),
              ...(s.paddingLeft ? { paddingLeft: s.paddingLeft } : {}),
              ...(s.paddingRight ? { paddingRight: s.paddingRight } : {}),
              ...(s.marginTop ? { marginTop: s.marginTop } : {}),
              ...(s.marginBottom ? { marginBottom: s.marginBottom } : {}),
              ...(s.bgColor ? { backgroundColor: s.bgColor, '--theme-bg': s.bgColor } as React.CSSProperties : {}),
              ...(s.borderRadius ? { borderRadius: s.borderRadius } : {}),
              ...(block.type !== 'navbar' ? { overflow: 'hidden' } : {}),
            };

            return (
              <BlockWrapper key={block.id} block={block} index={index}>
                <div style={blockStyle}>
                  <BlockContentComponent
                    blockId={block.id}
                    data={block.data}
                    isMobile={deviceMode === 'mobile'}
                    isTablet={deviceMode === 'tablet'}
                    isPreviewMode={isPreviewMode}
                  />
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
                          addBlock(entry.type, translatedLabel, null, entry.initialData);
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

      <RemoteCursors containerRef={viewportRef} />
      <FloatingViewportControls onCenterCanvas={handleCenterCanvas} />
    </div>
  );
}

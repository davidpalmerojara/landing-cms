'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editor-store';

const DRAG_THRESHOLD = 5;
const SCROLL_THRESHOLD = 120;
const MAX_SCROLL_SPEED = 25;
const MIN_SCROLL_SPEED = 4;

// --- Hit-testing helpers ---

function computeCanvasDropIndex(clientX: number, clientY: number): number | null {
  const viewport = document.querySelector('[data-canvas-viewport]');
  if (!viewport) return null;
  const vpRect = viewport.getBoundingClientRect();

  if (clientX < vpRect.left || clientX > vpRect.right ||
      clientY < vpRect.top || clientY > vpRect.bottom) {
    return null;
  }

  const wrappers = document.querySelectorAll('[data-block-index]');
  if (wrappers.length === 0) return 0;

  for (const wrapper of wrappers) {
    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const idx = parseInt(wrapper.getAttribute('data-block-index')!, 10);
    if (clientY < midY) return idx;
  }

  return wrappers.length;
}

function computeLayerDropIndex(clientX: number, clientY: number): number | null {
  const container = document.querySelector('[data-layers-container]');
  if (!container) return null;
  const containerRect = container.getBoundingClientRect();

  if (clientX < containerRect.left || clientX > containerRect.right ||
      clientY < containerRect.top || clientY > containerRect.bottom) {
    return null;
  }

  const items = document.querySelectorAll('[data-layer-index]');
  if (items.length === 0) return 0;

  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const idx = parseInt(item.getAttribute('data-layer-index')!, 10);
    if (clientY < midY) return idx;
  }

  return items.length;
}

// --- Auto-scroll helpers ---

function computeScrollIntent(clientY: number, rect: DOMRect) {
  const distToTop = clientY - rect.top;
  const distToBottom = rect.bottom - clientY;

  if (distToTop >= 0 && distToTop < SCROLL_THRESHOLD) {
    const speed = MAX_SCROLL_SPEED * (1 - distToTop / SCROLL_THRESHOLD);
    return { direction: -1, speed: Math.max(speed, MIN_SCROLL_SPEED) };
  }
  if (distToBottom >= 0 && distToBottom < SCROLL_THRESHOLD) {
    const speed = MAX_SCROLL_SPEED * (1 - distToBottom / SCROLL_THRESHOLD);
    return { direction: 1, speed: Math.max(speed, MIN_SCROLL_SPEED) };
  }
  return null;
}

// --- Hook ---

export function useDragManager() {
  const rafRef = useRef<number | null>(null);
  const scrollStateRef = useRef({
    canvasDir: 0,
    canvasSpeed: 0,
    sidebarDir: 0,
    sidebarSpeed: 0,
    sidebarContainer: null as HTMLElement | null,
  });

  const scrollLoop = useCallback(() => {
    const ss = scrollStateRef.current;
    let needsLoop = false;

    if (ss.canvasDir !== 0) {
      const store = useEditorStore.getState();
      store.setViewportState((prev) => ({
        ...prev,
        y: prev.y - ss.canvasDir * ss.canvasSpeed,
      }));
      needsLoop = true;
    }

    if (ss.sidebarDir !== 0 && ss.sidebarContainer) {
      ss.sidebarContainer.scrollTop += ss.sidebarDir * ss.sidebarSpeed;
      needsLoop = true;
    }

    if (needsLoop) {
      rafRef.current = requestAnimationFrame(scrollLoop);
    } else {
      rafRef.current = null;
    }
  }, []);

  const startScrollLoop = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(scrollLoop);
    }
  }, [scrollLoop]);

  const stopScrollLoop = useCallback(() => {
    scrollStateRef.current = {
      canvasDir: 0,
      canvasSpeed: 0,
      sidebarDir: 0,
      sidebarSpeed: 0,
      sidebarContainer: null,
    };
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopScrollLoop();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [stopScrollLoop]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const store = useEditorStore.getState();
      const { dragPending, isDragging } = store;

      // Check threshold for pending drag
      if (dragPending && !isDragging) {
        const dx = e.clientX - dragPending.origin.x;
        const dy = e.clientY - dragPending.origin.y;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          store.activateDrag({ x: e.clientX, y: e.clientY });
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }
        return;
      }

      if (!isDragging) return;

      // Update position
      store.updateDragPosition({ x: e.clientX, y: e.clientY });

      // Compute drop targets
      store.setCanvasDropIndex(computeCanvasDropIndex(e.clientX, e.clientY));
      store.setLayerDropIndex(computeLayerDropIndex(e.clientX, e.clientY));

      // Auto-scroll: canvas viewport
      const viewport = document.querySelector('[data-canvas-viewport]');
      if (viewport) {
        const vpRect = viewport.getBoundingClientRect();
        const intent = computeScrollIntent(e.clientY, vpRect);
        scrollStateRef.current.canvasDir = intent?.direction ?? 0;
        scrollStateRef.current.canvasSpeed = intent?.speed ?? 0;
      } else {
        scrollStateRef.current.canvasDir = 0;
      }

      // Auto-scroll: sidebar layers
      const sidebar = document.querySelector('[data-layers-scroll]') as HTMLElement | null;
      if (sidebar) {
        const sbRect = sidebar.getBoundingClientRect();
        const intent = computeScrollIntent(e.clientY, sbRect);
        scrollStateRef.current.sidebarDir = intent?.direction ?? 0;
        scrollStateRef.current.sidebarSpeed = intent?.speed ?? 0;
        scrollStateRef.current.sidebarContainer = sidebar;
      } else {
        scrollStateRef.current.sidebarDir = 0;
      }

      if (scrollStateRef.current.canvasDir !== 0 || scrollStateRef.current.sidebarDir !== 0) {
        startScrollLoop();
      }
    };

    const handlePointerUp = () => {
      const store = useEditorStore.getState();
      if (store.isDragging) {
        store.performDrop();
      } else if (store.dragPending) {
        store.cancelDrag();
      }
      cleanup();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const store = useEditorStore.getState();
        if (store.isDragging || store.dragPending) {
          store.cancelDrag();
          cleanup();
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      cleanup();
    };
  }, [startScrollLoop, cleanup]);
}

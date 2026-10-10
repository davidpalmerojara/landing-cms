'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { LONG_PRESS_MS, MOUSE_DRAG_THRESHOLD, decidePendingTouch } from '@/lib/touch-drag';

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

/** The pointer that went down last: a pending drag belongs to it. */
interface GesturePointer {
  pointerId: number;
  pointerType: string;
  time: number;
  fromHandle: boolean;
}

const CLICK_AFTER_DROP_MS = 400;
let lastDropAt = 0;

/**
 * True right after a drag ended. A tap-to-add tile checks it so a click the
 * browser may still send after the drop does not add the block a second time.
 */
export function dragEndedRecently(): boolean {
  const elapsed = Date.now() - lastDropAt;
  return elapsed >= 0 && elapsed < CLICK_AFTER_DROP_MS;
}

/**
 * Pointer-based drag and drop of blocks: components from the sidebar onto the
 * canvas, and blocks or layers to a new position. Mouse drags start after a
 * few pixels; touch drags follow lib/touch-drag (handle, long press, or a
 * sideways move out of the components list).
 */
export function useDragManager() {
  const rafRef = useRef<number | null>(null);
  const scrollStateRef = useRef({
    canvasDir: 0,
    canvasSpeed: 0,
    sidebarDir: 0,
    sidebarSpeed: 0,
    sidebarContainer: null as HTMLElement | null,
  });

  const scrollLoop = useCallback(function scrollLoop() {
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
    let gesture: GesturePointer | null = null;
    let longPressTimer: number | null = null;
    const touchPointers = new Set<number>();

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const activate = (x: number, y: number) => {
      const store = useEditorStore.getState();
      if (!store.dragPending || store.isDragging) return;
      store.activateDrag({ x, y });
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      if (gesture?.pointerType === 'touch') {
        // A long press may have started a text selection; the drag replaces it
        window.getSelection()?.removeAllRanges();
        if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
      }
    };

    // Capture phase: runs before the touched element's own handler calls initDrag
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touchPointers.add(e.pointerId);
        if (touchPointers.size > 1) {
          // A second finger: pinch or two-finger pan, never a drag
          clearLongPress();
          gesture = null;
          const store = useEditorStore.getState();
          if (store.dragPending && !store.isDragging) store.cancelDrag();
          return;
        }
      }
      const target = e.target instanceof Element ? e.target : null;
      gesture = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        time: Date.now(),
        fromHandle: target?.closest('[data-drag-handle]') != null,
      };
      clearLongPress();
      if (e.pointerType === 'touch') {
        const { clientX, clientY } = e;
        // Holding still picks the element up, if what was touched is draggable
        longPressTimer = window.setTimeout(() => {
          longPressTimer = null;
          activate(clientX, clientY);
        }, LONG_PRESS_MS);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && (!gesture || e.pointerId !== gesture.pointerId)) return;
      const store = useEditorStore.getState();
      const { dragPending, isDragging } = store;

      // Check threshold for pending drag
      if (dragPending && !isDragging) {
        const dx = e.clientX - dragPending.origin.x;
        const dy = e.clientY - dragPending.origin.y;
        if (gesture?.pointerType === 'touch') {
          const decision = decidePendingTouch({
            dx,
            dy,
            elapsed: Date.now() - gesture.time,
            action: dragPending.source.action,
            fromHandle: gesture.fromHandle,
          });
          if (decision === 'cancel') {
            // The finger is panning the canvas or scrolling a list
            clearLongPress();
            store.cancelDrag();
          } else if (decision === 'activate') {
            clearLongPress();
            activate(e.clientX, e.clientY);
          }
          return;
        }
        if (Math.abs(dx) + Math.abs(dy) > MOUSE_DRAG_THRESHOLD) activate(e.clientX, e.clientY);
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

    /** Forgets a lifted finger; true when it was the one a drag belongs to. */
    const releasePointer = (e: PointerEvent) => {
      touchPointers.delete(e.pointerId);
      if (gesture && e.pointerId !== gesture.pointerId) return false;
      clearLongPress();
      gesture = null;
      return true;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!releasePointer(e)) return;
      const store = useEditorStore.getState();
      if (store.isDragging) {
        store.performDrop();
        lastDropAt = Date.now();
      } else if (store.dragPending) {
        store.cancelDrag();
      }
      cleanup();
    };

    // The browser took the gesture over (a scroll, a system gesture): nothing is dropped
    const handlePointerCancel = (e: PointerEvent) => {
      if (!releasePointer(e)) return;
      const store = useEditorStore.getState();
      if (store.isDragging || store.dragPending) store.cancelDrag();
      cleanup();
    };

    // While a finger drags, the page must not scroll under it
    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable && useEditorStore.getState().isDragging) e.preventDefault();
    };

    // A long press opens the context menu on touch screens; not while picking something up
    const handleContextMenu = (e: MouseEvent) => {
      const store = useEditorStore.getState();
      if (gesture?.pointerType === 'touch' && (store.dragPending || store.isDragging)) e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const store = useEditorStore.getState();
        if (store.isDragging || store.dragPending) {
          clearLongPress();
          store.cancelDrag();
          cleanup();
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDownCapture, true);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearLongPress();
      window.removeEventListener('pointerdown', handlePointerDownCapture, true);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      cleanup();
    };
  }, [startScrollLoop, cleanup]);
}

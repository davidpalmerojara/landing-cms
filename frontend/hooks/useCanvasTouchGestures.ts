'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { pinchView } from '@/lib/canvas-zoom';
import type { PinchStart } from '@/lib/canvas-zoom';
import { TOUCH_SLOP } from '@/lib/touch-drag';
import { isTextEntryTarget } from '@/lib/keyboard';

const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 30; // px between the two taps
const CLICK_AFTER_GESTURE_MS = 400;

type Mode = 'idle' | 'pending' | 'pan' | 'pinch' | 'ignore';

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Finger gestures on the canvas (QA-022, ADR-043). The viewport has
 * `touch-action: none`, so the browser neither scrolls nor zooms the page
 * there and these handlers do instead:
 * - one finger pans the canvas (over blocks too: they fill the frame);
 * - two fingers pinch to zoom around their midpoint, within the zoom limits;
 * - a tap stays a click (select a block, clear the selection), and a click
 *   that ends a pan or a pinch is swallowed;
 * - a double tap is delivered as `dblclick`, which starts inline text editing,
 *   whether or not the browser sends one itself for touch.
 * Holding a finger still on a block is left to useDragManager (long press
 * picks the block up); the grip of the block toolbar and text being edited
 * are left alone.
 */
export function useCanvasTouchGestures(viewportRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const pointers = new Map<number, Point>();
    let mode: Mode = 'idle';
    let start: Point = { x: 0, y: 0 };
    let last: Point = { x: 0, y: 0 };
    let pinch: PinchStart | null = null;
    let suppressClickUntil = 0;
    let lastTap: (Point & { time: number }) | null = null;
    let lastTouchAt = 0;

    const store = () => useEditorStore.getState();
    const local = (p: Point): Point => {
      const rect = viewport.getBoundingClientRect();
      return { x: p.x - rect.left, y: p.y - rect.top };
    };
    const setPanning = (isPanning: boolean) => {
      if (store().interactionState.isPanning === isPanning) return;
      store().setInteractionState((prev) => ({ ...prev, isPanning }));
    };

    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      const mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pinch = { view: store().viewportState, distance: distance(a, b), midX: mid.x, midY: mid.y };
      mode = 'pinch';
      lastTap = null;
      const { dragPending, isDragging, cancelDrag } = store();
      if (dragPending && !isDragging) cancelDrag();
      setPanning(true);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      lastTouchAt = Date.now();
      const point = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, point);

      if (pointers.size === 1) {
        // A new touch: its click is a real tap, whatever the previous gesture was
        suppressClickUntil = 0;
        const target = e.target instanceof Element ? e.target : null;
        // The toolbar grip drags the block; a field being edited keeps its own touches
        const leftAlone = target?.closest('[data-drag-handle], [data-canvas-controls]') != null || isTextEntryTarget(target);
        mode = leftAlone ? 'ignore' : 'pending';
        start = point;
        last = point;
        // The second tap of a double tap: no emulated mousedown, whose focus change
        // would end the inline editing the double tap is about to start
        if (mode === 'pending' && lastTap && Date.now() - lastTap.time < DOUBLE_TAP_MS
          && distance(point, lastTap) < DOUBLE_TAP_DISTANCE) {
          e.preventDefault();
        }
        return;
      }
      if (pointers.size === 2 && mode !== 'ignore' && !store().isDragging) startPinch();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pointers.has(e.pointerId)) return;
      const point = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, point);
      if (store().isDragging) return; // a long press picked a block up

      if (mode === 'pending' && distance(point, start) > TOUCH_SLOP) {
        mode = 'pan';
        lastTap = null;
        setPanning(true);
      }
      if (mode === 'pan') {
        const dx = point.x - last.x;
        const dy = point.y - last.y;
        last = point;
        store().setViewportState((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      } else if (mode === 'pinch' && pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const next = pinchView(pinch, distance(a, b), mid.x, mid.y);
        store().setViewportState(next);
      }
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerType !== 'touch' || !pointers.has(e.pointerId)) return;
      lastTouchAt = Date.now();
      pointers.delete(e.pointerId);
      // useDragManager drops on its window listener, after this one: a drag is still on here
      const dragged = store().isDragging;

      if (mode === 'pinch') {
        suppressClickUntil = Date.now() + CLICK_AFTER_GESTURE_MS;
        if (pointers.size === 1) {
          // One finger stays down: it carries on panning from where it is
          mode = 'pan';
          last = [...pointers.values()][0];
          pinch = null;
          return;
        }
      }
      if (pointers.size > 0) return;

      if (mode === 'pan' || mode === 'pinch' || dragged) {
        suppressClickUntil = Date.now() + CLICK_AFTER_GESTURE_MS;
      } else if (mode === 'pending' && !cancelled) {
        const now = Date.now();
        const point = { x: e.clientX, y: e.clientY };
        if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && distance(point, lastTap) < DOUBLE_TAP_DISTANCE) {
          lastTap = null;
          // Deliver the double tap the way a mouse double-click arrives: inline editing listens for it
          e.target?.dispatchEvent(new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            clientX: e.clientX,
            clientY: e.clientY,
            detail: 2,
          }));
        } else {
          lastTap = { ...point, time: now };
        }
      }
      mode = 'idle';
      pinch = null;
      setPanning(false);
    };

    const handlePointerUp = (e: PointerEvent) => finishPointer(e, false);
    const handlePointerCancel = (e: PointerEvent) => finishPointer(e, true);

    const handleClickCapture = (e: MouseEvent) => {
      if (Date.now() >= suppressClickUntil) return;
      e.stopPropagation();
      e.preventDefault();
    };

    // The browser's own double-click from a double tap, if it sends one: ours already went out
    const handleDoubleClickCapture = (e: MouseEvent) => {
      if (e.isTrusted && Date.now() - lastTouchAt < CLICK_AFTER_GESTURE_MS) e.stopPropagation();
    };

    // Safari's own pinch gesture events: the page must not zoom from the canvas
    const preventDefault = (e: Event) => e.preventDefault();

    viewport.addEventListener('pointerdown', handlePointerDown);
    viewport.addEventListener('pointermove', handlePointerMove);
    viewport.addEventListener('pointerup', handlePointerUp);
    viewport.addEventListener('pointercancel', handlePointerCancel);
    viewport.addEventListener('click', handleClickCapture, true);
    viewport.addEventListener('dblclick', handleDoubleClickCapture, true);
    viewport.addEventListener('gesturestart', preventDefault);
    viewport.addEventListener('gesturechange', preventDefault);
    return () => {
      viewport.removeEventListener('pointerdown', handlePointerDown);
      viewport.removeEventListener('pointermove', handlePointerMove);
      viewport.removeEventListener('pointerup', handlePointerUp);
      viewport.removeEventListener('pointercancel', handlePointerCancel);
      viewport.removeEventListener('click', handleClickCapture, true);
      viewport.removeEventListener('dblclick', handleDoubleClickCapture, true);
      viewport.removeEventListener('gesturestart', preventDefault);
      viewport.removeEventListener('gesturechange', preventDefault);
    };
  }, [viewportRef]);
}

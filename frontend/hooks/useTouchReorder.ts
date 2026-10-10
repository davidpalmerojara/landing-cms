'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the handle must be held before the drag starts (ms) */
const HOLD_MS = 150;
/** A finger that moves further than this before the hold is a scroll, not a drag (px) */
const MOVE_TOLERANCE = 8;
/** Distance from the list's top or bottom edge where the list starts scrolling (px) */
export const AUTO_SCROLL_EDGE = 72;
/** Fastest auto-scroll, at the very edge (px per frame) */
const AUTO_SCROLL_MAX_SPEED = 16;

interface ItemRect {
  top: number;
  height: number;
}

/**
 * Index where an item dropped at viewport height `y` lands: before the first
 * item whose middle is below `y`, or after the last. `rects` are the items'
 * current positions (read again after every scroll, QA-071).
 */
export function dropIndexAt(y: number, rects: ItemRect[]): number {
  for (let i = 0; i < rects.length; i++) {
    if (y < rects[i].top + rects[i].height / 2) return i;
  }
  return rects.length;
}

/**
 * Auto-scroll step for a finger at `y` inside a scroll area spanning
 * `top`..`bottom`: negative near the top edge, positive near the bottom,
 * faster the closer to the edge, 0 elsewhere.
 */
export function autoScrollSpeed(y: number, top: number, bottom: number): number {
  if (y < top + AUTO_SCROLL_EDGE) {
    return -Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (top + AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE));
  }
  if (y > bottom - AUTO_SCROLL_EDGE) {
    return Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (y - (bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE));
  }
  return 0;
}

interface TouchReorderOptions {
  /** The scrolling element that holds the list */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** The list; its items are its `[role="listitem"]` descendants */
  listRef: React.RefObject<HTMLElement | null>;
  onReorder: (from: number, to: number) => void;
}

/**
 * Reordering a list by touch from a drag handle (Quick Edit): hold the handle,
 * move, release. Near the top or bottom edge the list scrolls by itself, and
 * the drop position is measured again on every move and scroll step, so an
 * item can travel the whole of a long list (QA-071).
 */
export function useTouchReorder({ scrollRef, listRef, onReorder }: TouchReorderOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** How far the dragged item has moved from its place, so it follows the finger (MOBILE2-008) */
  const [dragOffset, setDragOffset] = useState(0);
  const dragOffsetRef = useRef(0);
  const dragOriginRef = useRef({ fingerY: 0, scrollTop: 0 });
  const dragIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startYRef = useRef(0);
  const fingerYRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const itemRects = useCallback((): ItemRect[] => {
    const items = listRef.current?.querySelectorAll('[role="listitem"]') ?? [];
    return Array.from(items, (item, index) => {
      const rect = item.getBoundingClientRect();
      // The dragged item is measured where it sits in the list, not where the finger has taken it
      const moved = index === dragIndexRef.current ? dragOffsetRef.current : 0;
      return { top: rect.top - moved, height: rect.height };
    });
  }, [listRef]);

  /** The dragged item under the finger, and where it would land */
  const updateDrag = useCallback(() => {
    // Measured before the offset changes: the rects still carry the transform last drawn
    const next = dropIndexAt(fingerYRef.current, itemRects());
    if (next !== dropIndexRef.current) {
      dropIndexRef.current = next;
      setDropIndex(next);
    }
    const scrolled = (scrollRef.current?.scrollTop ?? 0) - dragOriginRef.current.scrollTop;
    const offset = fingerYRef.current - dragOriginRef.current.fingerY + scrolled;
    if (offset !== dragOffsetRef.current) {
      dragOffsetRef.current = offset;
      setDragOffset(offset);
    }
  }, [itemRects, scrollRef]);

  const stopAutoScroll = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  // One scroll step per frame while the finger stays near an edge (the loop calls itself through the ref)
  const autoScrollStepRef = useRef<() => void>(() => {});
  const autoScrollStep = useCallback(() => {
    frameRef.current = null;
    const area = scrollRef.current;
    if (!area || dragIndexRef.current === null) return;
    const bounds = area.getBoundingClientRect();
    const speed = autoScrollSpeed(fingerYRef.current, bounds.top, bounds.bottom);
    if (speed === 0) return;
    const before = area.scrollTop;
    area.scrollTop = before + speed;
    if (area.scrollTop === before) return; // at the end of the list
    updateDrag();
    frameRef.current = requestAnimationFrame(() => autoScrollStepRef.current());
  }, [scrollRef, updateDrag]);
  useEffect(() => {
    autoScrollStepRef.current = autoScrollStep;
  }, [autoScrollStep]);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const finish = useCallback(() => {
    clearHold();
    stopAutoScroll();
    const from = dragIndexRef.current;
    const to = dropIndexRef.current;
    dragIndexRef.current = null;
    dropIndexRef.current = null;
    dragOffsetRef.current = 0;
    setDragIndex(null);
    setDropIndex(null);
    setDragOffset(0);
    if (from !== null && to !== null && to !== from && to !== from + 1) onReorder(from, to);
  }, [clearHold, onReorder, stopAutoScroll]);

  useEffect(() => () => {
    clearHold();
    stopAutoScroll();
  }, [clearHold, stopAutoScroll]);

  /** touchstart on an item's handle */
  const onHandleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    const y = e.touches[0].clientY;
    startYRef.current = y;
    fingerYRef.current = y;
    clearHold();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      dragOriginRef.current = { fingerY: fingerYRef.current, scrollTop: scrollRef.current?.scrollTop ?? 0 };
      dragOffsetRef.current = 0;
      dragIndexRef.current = index;
      dropIndexRef.current = index;
      setDragIndex(index);
      setDropIndex(index);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
    }, HOLD_MS);
  }, [clearHold, scrollRef]);

  /** touchmove anywhere in the list */
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    fingerYRef.current = y;
    if (dragIndexRef.current === null) {
      if (holdTimerRef.current && Math.abs(y - startYRef.current) > MOVE_TOLERANCE) clearHold();
      return;
    }
    updateDrag();
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(autoScrollStep);
  }, [autoScrollStep, clearHold, updateDrag]);

  return { dragIndex, dropIndex, dragOffset, onHandleTouchStart, onTouchMove, onTouchEnd: finish };
}

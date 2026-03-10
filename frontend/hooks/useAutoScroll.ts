'use client';

import { useRef, useEffect, useCallback } from 'react';

interface AutoScrollState {
  direction: number;
  speed: number;
  container: HTMLElement | null;
  isCanvas: boolean;
}

export function useAutoScroll(onCanvasScroll?: (deltaY: number) => void) {
  const autoScrollState = useRef<AutoScrollState>({
    direction: 0,
    speed: 0,
    container: null,
    isCanvas: false,
  });
  const rafRef = useRef<number | null>(null);
  const onCanvasScrollRef = useRef(onCanvasScroll);
  onCanvasScrollRef.current = onCanvasScroll;

  const scrollLoop = useCallback(() => {
    const state = autoScrollState.current;
    if (state.direction !== 0 && state.container) {
      if (state.isCanvas && onCanvasScrollRef.current) {
        onCanvasScrollRef.current(-state.direction * state.speed);
      } else if (!state.isCanvas) {
        state.container.scrollTop += state.direction * state.speed;
      }
      rafRef.current = requestAnimationFrame(scrollLoop);
    } else {
      rafRef.current = null;
    }
  }, []);

  const handleAutoScroll = useCallback(
    (
      e: React.DragEvent | DragEvent,
      containerRef: React.RefObject<HTMLElement | null>,
      isCanvas = false
    ) => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      // During HTML5 drag, Chrome sometimes reports (0,0) — ignore only if
      // the coordinates are clearly outside the viewport.
      if (e.clientY <= 0 && e.clientX <= 0) return;

      const scrollThreshold = 120;
      const maxSpeed = 25;

      const distanceToTop = e.clientY - rect.top;
      const distanceToBottom = rect.bottom - e.clientY;

      let newDir = 0;
      let speed = 0;

      if (distanceToTop >= 0 && distanceToTop < scrollThreshold) {
        newDir = -1;
        speed = maxSpeed * (1 - distanceToTop / scrollThreshold);
      } else if (distanceToBottom >= 0 && distanceToBottom < scrollThreshold) {
        newDir = 1;
        speed = maxSpeed * (1 - distanceToBottom / scrollThreshold);
      }

      if (newDir !== 0) {
        autoScrollState.current = {
          direction: newDir,
          speed: Math.max(speed, 4),
          container,
          isCanvas,
        };
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(scrollLoop);
        }
      } else {
        stopAutoScroll();
      }
    },
    [scrollLoop]
  );

  const stopAutoScroll = useCallback(() => {
    autoScrollState.current.direction = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const stop = () => stopAutoScroll();
    window.addEventListener('mouseup', stop);
    window.addEventListener('dragend', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('dragend', stop);
    };
  }, [stopAutoScroll]);

  return { handleAutoScroll, stopAutoScroll };
}

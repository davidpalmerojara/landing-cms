import { useEditorStore } from '@/store/editor-store';

const REVEAL_MARGIN = 24; // px kept between a revealed block and the viewport edge

/**
 * Pans the canvas so `el` (a block, or something inside one) is in view. The
 * canvas is panned with viewportState, not scrolled, so any offset the browser
 * added to the overflow:hidden viewport (when focusing) is undone first.
 */
export function revealInViewport(el: HTMLElement) {
  const viewport = el.closest<HTMLElement>('[data-canvas-viewport]');
  if (!viewport) return;
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
  const view = viewport.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let dy = 0;
  if (box.top < view.top + REVEAL_MARGIN) {
    dy = view.top + REVEAL_MARGIN - box.top;
  } else if (box.bottom > view.bottom - REVEAL_MARGIN) {
    // Never push the top of a tall block out of view
    dy = Math.max(view.bottom - REVEAL_MARGIN - box.bottom, view.top + REVEAL_MARGIN - box.top);
  }
  if (dy !== 0) useEditorStore.getState().setViewportState((prev) => ({ ...prev, y: prev.y + dy }));
}

/** Pans the canvas to the block with this id, if it is on the canvas (QA-043). */
export function revealBlock(blockId: string) {
  const el = document.getElementById(`block-focus-${blockId}`);
  if (el) revealInViewport(el);
}

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

/**
 * Below `xl` the inspector opens over the right side of the canvas: pans the
 * canvas left so the selected block's toolbar (its Delete button included) is
 * beside the overlay, not under it (EDITOR2-004). It never pushes the
 * toolbar's left edge out of view.
 */
export function revealBesideOverlay(blockId: string, overlay: HTMLElement) {
  const block = document.getElementById(`block-focus-${blockId}`);
  const toolbar = block?.querySelector<HTMLElement>('[data-block-toolbar]');
  const viewport = block?.closest<HTMLElement>('[data-canvas-viewport]');
  if (!toolbar || !viewport) return;
  const covered = overlay.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  // The overlay is not over the canvas (docked, or closed)
  if (covered.width === 0 || covered.left >= view.right || covered.right <= view.left) return;
  const bar = toolbar.getBoundingClientRect();
  const overlap = bar.right + REVEAL_MARGIN - covered.left;
  if (overlap <= 0) return;
  const room = Math.max(0, bar.left - (view.left + REVEAL_MARGIN));
  const dx = Math.min(overlap, room);
  if (dx > 0) useEditorStore.getState().setViewportState((prev) => ({ ...prev, x: prev.x - dx }));
}


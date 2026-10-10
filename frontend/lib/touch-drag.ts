/**
 * When a finger on a draggable element starts a drag (QA-022). With a mouse
 * a few pixels of movement start it; with a finger the same movement usually
 * means "scroll" or "pan the canvas", so a touch drag needs one of:
 * - a dedicated drag handle (the grip of the block toolbar): moving drags;
 * - a long press: holding still for LONG_PRESS_MS picks the element up;
 * - for a component tile of the sidebar, moving sideways (towards the canvas),
 *   since moving up or down scrolls the list of components.
 */

export const MOUSE_DRAG_THRESHOLD = 5; // px, |dx| + |dy|
export const TOUCH_SLOP = 10; // px a finger may wander and still be "holding still"
export const LONG_PRESS_MS = 450;

export type PendingTouchDecision = 'wait' | 'activate' | 'cancel';

export interface PendingTouch {
  dx: number;
  dy: number;
  /** ms since the finger went down */
  elapsed: number;
  /** 'add' for a sidebar tile, 'reorder' for a block or a layer */
  action: 'add' | 'reorder';
  /** The finger went down on a drag handle */
  fromHandle: boolean;
}

export function decidePendingTouch({ dx, dy, elapsed, action, fromHandle }: PendingTouch): PendingTouchDecision {
  const moved = Math.hypot(dx, dy) > TOUCH_SLOP;
  if (!moved) return elapsed >= LONG_PRESS_MS ? 'activate' : 'wait';
  if (fromHandle || elapsed >= LONG_PRESS_MS) return 'activate';
  if (action === 'add' && Math.abs(dx) > Math.abs(dy)) return 'activate';
  return 'cancel';
}

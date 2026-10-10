/**
 * Zoom and pan arithmetic of the editor canvas. The canvas is a fixed-width
 * frame drawn with `translate(x, y) scale(zoom)` inside the viewport; these
 * helpers keep every way of zooming (buttons, wheel, pinch, fit) on the same
 * limits.
 */

export interface CanvasViewState {
  zoom: number;
  x: number;
  y: number;
}

/** Low enough that "fit" shows the whole desktop frame on a 1024 px tablet (QA-022). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

/**
 * Outer width of the frame for each device: the content width the device
 * gets (BrowserFrame) plus its 1 px border on each side.
 */
export const FRAME_BORDER = 1;
export const CANVAS_CONTENT_WIDTHS: Record<string, number> = { mobile: 375, tablet: 768, desktop: 1200 };
const CANVAS_MARGIN = 24; // px kept free on each side when fitting
const CANVAS_TOP = 40;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export function frameWidth(deviceMode: string): number {
  return (CANVAS_CONTENT_WIDTHS[deviceMode] ?? CANVAS_CONTENT_WIDTHS.desktop) + FRAME_BORDER * 2;
}

/** Zoom ≤ 100% that fits the frame in the viewport, centered horizontally. */
export function fitCanvas(viewportWidth: number, deviceMode: string): CanvasViewState {
  const width = frameWidth(deviceMode);
  const available = Math.max(viewportWidth - CANVAS_MARGIN * 2, 0);
  const zoom = clampZoom(Math.min(1, Math.floor((available / width) * 20) / 20));
  return { zoom, x: (viewportWidth - width * zoom) / 2, y: CANVAS_TOP };
}

/**
 * The view at `zoom` that keeps the canvas point under (`cx`, `cy`) (viewport
 * coordinates) where it is on screen.
 */
export function zoomAround(view: CanvasViewState, zoom: number, cx: number, cy: number): CanvasViewState {
  const next = clampZoom(zoom);
  if (next === view.zoom) return view;
  const ratio = next / view.zoom;
  return { zoom: next, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

/** One zoom step in or out (`direction` 1 or -1), rounded to tenths, around (`cx`, `cy`). */
export function stepZoom(view: CanvasViewState, direction: 1 | -1, cx: number, cy: number): CanvasViewState {
  // From an in-between zoom such as a fitted 0.35, the first step lands on the next tenth
  const tenths = view.zoom / ZOOM_STEP;
  const base = direction === 1 ? Math.floor(tenths + 1e-9) : Math.ceil(tenths - 1e-9);
  const target = Math.round(base + direction) * ZOOM_STEP;
  return zoomAround(view, Math.round(target * 100) / 100, cx, cy);
}

export interface PinchStart {
  view: CanvasViewState;
  distance: number;
  /** Midpoint of the two fingers, viewport coordinates */
  midX: number;
  midY: number;
}

/**
 * The view while two fingers pinch: the zoom follows the distance between
 * them and the canvas point first under their midpoint stays under it, so
 * moving both fingers also pans.
 */
export function pinchView(start: PinchStart, distance: number, midX: number, midY: number): CanvasViewState {
  if (start.distance <= 0) return start.view;
  const zoom = clampZoom(start.view.zoom * (distance / start.distance));
  const canvasX = (start.midX - start.view.x) / start.view.zoom;
  const canvasY = (start.midY - start.view.y) / start.view.zoom;
  return { zoom, x: midX - canvasX * zoom, y: midY - canvasY * zoom };
}

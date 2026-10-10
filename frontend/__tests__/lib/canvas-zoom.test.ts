import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM, MIN_ZOOM, clampZoom, fitCanvas, frameWidth, pinchView, stepZoom, zoomAround,
} from '@/lib/canvas-zoom';

describe('canvas zoom (QA-022)', () => {
  it('fits the desktop frame in the 512 px canvas of a 1024 px tablet: zoom goes below the old 0.5 floor', () => {
    const view = fitCanvas(512, 'desktop');
    expect(view.zoom).toBeLessThan(0.5);
    // The whole frame is inside the viewport, centred
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.x + frameWidth('desktop') * view.zoom).toBeLessThanOrEqual(512);
  });

  it('never fits above 100% and never below the minimum', () => {
    expect(fitCanvas(4000, 'mobile').zoom).toBe(1);
    expect(fitCanvas(10, 'desktop').zoom).toBe(MIN_ZOOM);
  });

  it('clamps every zoom to the limits', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('steps from a fitted in-between zoom to the next tenth, and stops at the limits', () => {
    const fitted = { zoom: 0.35, x: 0, y: 0 };
    expect(stepZoom(fitted, 1, 0, 0).zoom).toBe(0.4);
    expect(stepZoom(fitted, -1, 0, 0).zoom).toBe(0.3);
    expect(stepZoom({ zoom: MIN_ZOOM, x: 0, y: 0 }, -1, 0, 0).zoom).toBe(MIN_ZOOM);
    expect(stepZoom({ zoom: MAX_ZOOM, x: 0, y: 0 }, 1, 0, 0).zoom).toBe(MAX_ZOOM);
  });

  it('keeps the point under the cursor in place when zooming around it', () => {
    const view = { zoom: 1, x: 100, y: 50 };
    const next = zoomAround(view, 2, 300, 250);
    // Canvas point under (300, 250) before: ((300-100)/1, (250-50)/1) = (200, 200)
    expect((300 - next.x) / next.zoom).toBeCloseTo(200);
    expect((250 - next.y) / next.zoom).toBeCloseTo(200);
  });

  it('pinch: zoom follows the finger distance, the point under the fingers stays under them', () => {
    const start = { view: { zoom: 0.5, x: 0, y: 0 }, distance: 100, midX: 200, midY: 200 };
    const spread = pinchView(start, 200, 200, 200);
    expect(spread.zoom).toBe(1);
    expect((200 - spread.x) / spread.zoom).toBeCloseTo(400);
    // Moving both fingers pans too
    const moved = pinchView(start, 100, 260, 230);
    expect(moved.zoom).toBe(0.5);
    expect(moved.x).toBeCloseTo(60);
    expect(moved.y).toBeCloseTo(30);
    // Far beyond the limits it stops
    expect(pinchView(start, 10_000, 200, 200).zoom).toBe(MAX_ZOOM);
    expect(pinchView(start, 1, 200, 200).zoom).toBe(MIN_ZOOM);
  });

  it('QA-084: the frame width counts its border outside the device width (768 px of content on tablet)', () => {
    expect(frameWidth('tablet')).toBe(770);
    expect(frameWidth('mobile')).toBe(377);
  });
});

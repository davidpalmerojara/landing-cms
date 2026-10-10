import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealBesideOverlay } from '@/lib/canvas-reveal';
import { useEditorStore } from '@/store/editor-store';

function rect(left: number, width: number, top = 0, height = 40): DOMRect {
  return { left, right: left + width, width, top, bottom: top + height, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** A canvas 1024 px wide with block b1, whose toolbar is at `toolbarLeft`, and an overlay starting at `overlayLeft`. */
function layOut(toolbarLeft: number, overlayLeft: number) {
  document.body.innerHTML = `
    <div data-canvas-viewport>
      <div id="block-focus-b1"><div data-block-toolbar></div></div>
    </div>
    <aside id="overlay"></aside>`;
  vi.spyOn(document.querySelector('[data-canvas-viewport]')!, 'getBoundingClientRect').mockReturnValue(rect(0, 1024, 0, 700));
  vi.spyOn(document.querySelector('[data-block-toolbar]')!, 'getBoundingClientRect').mockReturnValue(rect(toolbarLeft, 160));
  const overlay = document.getElementById('overlay')!;
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue(rect(overlayLeft, 1024 - overlayLeft, 0, 700));
  return overlay;
}

describe('revealBesideOverlay (EDITOR2-004)', () => {
  beforeEach(() => {
    useEditorStore.setState({ viewportState: { x: 0, y: 0, zoom: 0.6 } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('pans the canvas left until the toolbar is clear of the inspector over it', () => {
    const overlay = layOut(600, 700);
    revealBesideOverlay('b1', overlay);
    // The toolbar ended at 760: it now ends 24 px before the overlay
    expect(useEditorStore.getState().viewportState.x).toBe(-84);
  });

  it('leaves the canvas alone when the toolbar is already visible', () => {
    const overlay = layOut(300, 700);
    revealBesideOverlay('b1', overlay);
    expect(useEditorStore.getState().viewportState.x).toBe(0);
  });

  it('never pushes the toolbar out on the left', () => {
    const overlay = layOut(100, 150);
    revealBesideOverlay('b1', overlay);
    expect(useEditorStore.getState().viewportState.x).toBe(-76);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import CanvasViewport from '@/components/editor/CanvasViewport';
import LeftSidebar from '@/components/editor/LeftSidebar';
import { useDragManager } from '@/hooks/useDragManager';
import { useEditorStore } from '@/store/editor-store';
import { LONG_PRESS_MS } from '@/lib/touch-drag';
import { MAX_ZOOM } from '@/lib/canvas-zoom';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const IDS = { hero: 'b-hero', features: 'b-features', cta: 'b-cta' };

function Editor({ withSidebar = false }: { withSidebar?: boolean }) {
  useDragManager();
  return (
    <main>
      {withSidebar && <LeftSidebar />}
      <CanvasViewport />
    </main>
  );
}

const state = () => useEditorStore.getState();
const blockOrder = () => state().page.blocks.map((b) => b.id);
const viewport = () => document.querySelector<HTMLElement>('[data-canvas-viewport]')!;
const contentOf = (id: string) => document.querySelector<HTMLElement>(`#block-focus-${id} [data-block-content]`)!;

function rect(top: number, height: number, left = 0, width = 800): DOMRect {
  return { top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** Lays the canvas out the way a browser would: the viewport at the top, blocks 100 px tall. */
function layOut() {
  vi.spyOn(viewport(), 'getBoundingClientRect').mockReturnValue(rect(0, 600));
  [IDS.hero, IDS.features, IDS.cta].forEach((id, i) => {
    const wrapper = document.getElementById(`block-wrapper-${id}`)!;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(rect(i * 100, 100));
  });
}

function touch(target: Element, type: string, x: number, y: number, pointerId = 1) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, {
      pointerType: 'touch', pointerId, isPrimary: pointerId === 1, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true,
    }));
  });
}

function tap(target: Element, x: number, y: number) {
  touch(target, 'pointerdown', x, y);
  touch(target, 'pointerup', x, y);
  click(target);
}

describe('the full editor on a touch screen (QA-022)', () => {
  let view: RenderResult;

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetEditorStore(makePage([
      makeBlock('hero', { title: 'Hola' }, { id: IDS.hero }),
      makeBlock('features', { title: 'Cosas' }, { id: IDS.features }),
      makeBlock('cta', { title: 'Ya' }, { id: IDS.cta }),
    ]));
    view = render(<Editor />);
    layOut();
  });

  afterEach(() => {
    view.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('one finger pans the canvas, also when it starts on a block, and selects nothing', () => {
    const start = state().viewportState;
    const hero = contentOf(IDS.hero);
    touch(hero, 'pointerdown', 200, 300);
    touch(hero, 'pointermove', 210, 260);
    touch(hero, 'pointermove', 230, 200);
    touch(hero, 'pointerup', 230, 200);
    // The click a browser may send at the end of the gesture is not a tap
    click(hero);

    expect(state().viewportState.x).toBe(start.x + 30);
    expect(state().viewportState.y).toBe(start.y - 100);
    expect(state().selectedBlockId).toBeNull();
    expect(state().isDragging).toBe(false);
    expect(blockOrder()).toEqual([IDS.hero, IDS.features, IDS.cta]);
  });

  it('a tap selects the block (no drag starts from a small finger wobble)', () => {
    const features = contentOf(IDS.features);
    touch(features, 'pointerdown', 100, 150);
    touch(features, 'pointermove', 104, 153);
    touch(features, 'pointerup', 104, 153);
    click(features);
    expect(state().selectedBlockId).toBe(IDS.features);
    expect(state().isDragging).toBe(false);
  });

  it('two fingers pinch-zoom the canvas around their midpoint, up to the limit', () => {
    state().setViewportState({ zoom: 0.5, x: 0, y: 0 });
    const el = viewport();
    touch(el, 'pointerdown', 300, 300, 1);
    touch(el, 'pointerdown', 400, 300, 2);
    touch(el, 'pointermove', 250, 300, 1);
    touch(el, 'pointermove', 450, 300, 2);

    // 100 px apart -> 200 px apart: twice the zoom, the canvas point under (350, 300) stays there
    const { zoom, x } = state().viewportState;
    expect(zoom).toBe(1);
    expect((350 - x) / zoom).toBeCloseTo(700);

    touch(el, 'pointermove', -2000, 300, 1);
    touch(el, 'pointermove', 3000, 300, 2);
    expect(state().viewportState.zoom).toBe(MAX_ZOOM);
    touch(el, 'pointerup', -2000, 300, 1);
    touch(el, 'pointerup', 3000, 300, 2);
    expect(state().selectedBlockId).toBeNull();
  });

  it('a double tap on text of the selected block starts inline editing', () => {
    const title = [...contentOf(IDS.hero).querySelectorAll('h1')][0];
    expect(title).toBeTruthy();
    tap(title, 120, 120);
    expect(state().selectedBlockId).toBe(IDS.hero);
    touch(title, 'pointerdown', 121, 121);
    touch(title, 'pointerup', 121, 121);
    expect(contentOf(IDS.hero).querySelector('[contenteditable="true"]')).not.toBeNull();
  });

  it('a long press picks a block up and the finger drops it elsewhere', () => {
    vi.useFakeTimers();
    const cta = contentOf(IDS.cta);
    touch(cta, 'pointerdown', 100, 250);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(state().isDragging).toBe(true);
    expect(state().dragSource).toMatchObject({ action: 'reorder', sourceIndex: 2 });

    const start = state().viewportState;
    touch(cta, 'pointermove', 100, 20);
    // Dragging, not panning
    expect(state().viewportState.y).toBe(start.y);
    expect(state().canvasDropIndex).toBe(0);
    touch(cta, 'pointerup', 100, 20);

    expect(blockOrder()).toEqual([IDS.cta, IDS.hero, IDS.features]);
    expect(state().isDragging).toBe(false);
  });

  it('moving before the long press is a pan: no drag starts later', () => {
    vi.useFakeTimers();
    const cta = contentOf(IDS.cta);
    touch(cta, 'pointerdown', 100, 250);
    touch(cta, 'pointermove', 100, 200);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(state().isDragging).toBe(false);
    expect(state().dragPending).toBeNull();
    touch(cta, 'pointerup', 100, 200);
    expect(blockOrder()).toEqual([IDS.hero, IDS.features, IDS.cta]);
  });

  it('the toolbar moves the selected block up and down without dragging', () => {
    act(() => {
      state().selectBlock(IDS.features);
    });
    const up = document.querySelector<HTMLButtonElement>('[aria-label="Subir Características"]')!;
    click(up);
    expect(blockOrder()).toEqual([IDS.features, IDS.hero, IDS.cta]);
    const down = document.querySelector<HTMLButtonElement>('[aria-label="Bajar Características"]')!;
    expect(up.disabled).toBe(true);
    click(down);
    click(document.querySelector<HTMLButtonElement>('[aria-label="Bajar Características"]')!);
    expect(blockOrder()).toEqual([IDS.hero, IDS.cta, IDS.features]);
  });

  it('QA-039: the toolbar keeps its size on screen at any zoom', () => {
    act(() => {
      state().selectBlock(IDS.hero);
      state().setViewportState({ zoom: 0.5, x: 0, y: 0 });
    });
    const toolbar = document.querySelector<HTMLElement>(`#block-focus-${IDS.hero} [data-block-toolbar]`)!;
    expect(toolbar.style.transform).toContain('scale(2)');
    act(() => {
      state().setViewportState({ zoom: 2, x: 0, y: 0 });
    });
    expect(toolbar.style.transform).toContain('scale(0.5)');
  });

  it('QA-077: the zoom buttons keep the selection', () => {
    act(() => {
      state().selectBlock(IDS.hero);
    });
    const zoom = state().viewportState.zoom;
    click(document.querySelector('[aria-label="Acercar"]') ?? document.querySelector('[title="Acercar"]')!);
    expect(state().viewportState.zoom).toBeGreaterThan(zoom);
    expect(state().selectedBlockId).toBe(IDS.hero);
  });
});

describe('layers panel (QA-043)', () => {
  let view: RenderResult;

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('clicking a layer far down the page brings its block into view', () => {
    resetEditorStore(makePage([
      makeBlock('hero', { title: 'Hola' }, { id: IDS.hero }),
      makeBlock('features', { title: 'Cosas' }, { id: IDS.features }),
      makeBlock('cta', { title: 'Ya' }, { id: IDS.cta }),
    ]));
    useEditorStore.setState({ leftTab: 'layers' });
    view = render(<Editor withSidebar />);
    vi.spyOn(viewport(), 'getBoundingClientRect').mockReturnValue(rect(0, 600));
    vi.spyOn(document.getElementById(`block-focus-${IDS.cta}`)!, 'getBoundingClientRect').mockReturnValue(rect(3000, 400));
    const before = state().viewportState.y;
    // Well after any drop of an earlier test (a click right after a drop is ignored)
    vi.useFakeTimers({ now: Date.now() + 60_000 });

    click(document.querySelector(`[data-layer-item][data-block-id="${IDS.cta}"]`)!);

    expect(state().selectedBlockId).toBe(IDS.cta);
    // The 400 px block (3000-3400) ends 24 px above the bottom of the 600 px canvas
    expect(state().viewportState.y).toBe(before - (3400 - (600 - 24)));
    vi.useRealTimers();
  });
});

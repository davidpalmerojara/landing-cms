import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { act } from 'react';
import CanvasViewport from '@/components/editor/CanvasViewport';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const IDS = { hero: 'b-hero', features: 'b-features', cta: 'b-cta' };

function loadCanvas() {
  resetEditorStore(makePage([
    makeBlock('hero', { title: 'Hola' }, { id: IDS.hero }),
    makeBlock('features', { title: 'Cosas' }, { id: IDS.features }),
    makeBlock('cta', { title: 'Ya' }, { id: IDS.cta }),
  ]));
}

const focusEl = (id: string) => document.getElementById(`block-focus-${id}`) as HTMLElement;
const blockOrder = () => useEditorStore.getState().page.blocks.map((b) => b.id);

function press(el: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
}

function pointerDown(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  });
}

/** The visible live-region text of a block (what a screen reader is told). */
const statusOf = (id: string) =>
  (focusEl(id).parentElement?.querySelector('[role="status"]')?.textContent ?? '').replace(/ /g, '').trim();

describe('canvas keyboard access', () => {
  let view: RenderResult;

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    loadCanvas();
    view = render(<CanvasViewport />);
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
  });

  it('names each block by its type and position', () => {
    expect(focusEl(IDS.hero).getAttribute('aria-label')).toBe('Bloque Hero, 1 de 3');
    expect(focusEl(IDS.features).getAttribute('aria-label')).toBe('Bloque Características, 2 de 3');
    expect(focusEl(IDS.cta).getAttribute('aria-label')).toBe('Bloque Llamada a la acción, 3 de 3');
    expect(focusEl(IDS.hero).getAttribute('role')).toBe('group');
  });

  it('describes the canvas and lists its shortcuts for screen readers', () => {
    const canvas = view.container.querySelector('[aria-describedby="canvas-keyboard-help"]');
    const help = document.getElementById('canvas-keyboard-help');

    expect(canvas?.getAttribute('aria-label')).toBe('Lienzo de la página, 3 bloques');
    expect(help?.textContent).toContain('Enter o Espacio');
    expect(help?.textContent).toContain('Alt con flechas');
    expect(help?.textContent).toContain('Supr o Retroceso');
  });

  it('is a single tab stop: one block in the tab order, the rest reachable with arrows', () => {
    expect(focusEl(IDS.hero).tabIndex).toBe(0);
    expect(focusEl(IDS.features).tabIndex).toBe(-1);
    expect(focusEl(IDS.cta).tabIndex).toBe(-1);

    act(() => focusEl(IDS.cta).focus());

    expect(focusEl(IDS.hero).tabIndex).toBe(-1);
    expect(focusEl(IDS.cta).tabIndex).toBe(0);
  });

  it('keeps the buttons and links inside the blocks out of the tab order', () => {
    const insideBlocks = Array.from(view.container.querySelectorAll<HTMLElement>('[data-block-focusable] button, [data-block-focusable] a[href]'))
      .filter((el) => !el.closest('[class*="absolute left-1/2"]'));

    expect(insideBlocks.length).toBeGreaterThan(0);
    for (const el of insideBlocks) expect(el.tabIndex).toBe(-1);
  });

  it('selects the block with Enter and Space, which also shows it in the inspector selection', () => {
    act(() => focusEl(IDS.features).focus());
    const enter = press(focusEl(IDS.features), 'Enter');

    expect(useEditorStore.getState().selectedBlockId).toBe(IDS.features);
    expect(enter.defaultPrevented).toBe(true);
    expect(focusEl(IDS.features).getAttribute('aria-label')).toContain('seleccionado');
    expect(statusOf(IDS.features)).toContain('Sus propiedades están en el inspector');

    act(() => useEditorStore.getState().selectBlock(null));
    press(focusEl(IDS.features), ' ');

    expect(useEditorStore.getState().selectedBlockId).toBe(IDS.features);
  });

  it('leaves Space to the canvas pan after a mouse click on the block', () => {
    pointerDown(focusEl(IDS.hero));
    act(() => focusEl(IDS.hero).focus());
    const space = press(focusEl(IDS.hero), ' ');

    expect(space.defaultPrevented).toBe(false);
    expect(useEditorStore.getState().selectedBlockId).toBeNull();
  });

  it('moves focus with ArrowDown, ArrowUp, Home and End', () => {
    act(() => focusEl(IDS.hero).focus());

    press(focusEl(IDS.hero), 'ArrowDown');
    expect(document.activeElement).toBe(focusEl(IDS.features));

    press(focusEl(IDS.features), 'ArrowDown');
    expect(document.activeElement).toBe(focusEl(IDS.cta));

    press(focusEl(IDS.cta), 'ArrowDown');
    expect(document.activeElement).toBe(focusEl(IDS.cta));

    press(focusEl(IDS.cta), 'ArrowUp');
    expect(document.activeElement).toBe(focusEl(IDS.features));

    press(focusEl(IDS.features), 'Home');
    expect(document.activeElement).toBe(focusEl(IDS.hero));

    press(focusEl(IDS.hero), 'End');
    expect(document.activeElement).toBe(focusEl(IDS.cta));
    expect(useEditorStore.getState().selectedBlockId).toBeNull();
  });

  it('clears the selection with Escape and keeps focus on the block', () => {
    act(() => useEditorStore.getState().selectBlock(IDS.features));
    act(() => focusEl(IDS.features).focus());

    press(focusEl(IDS.features), 'Escape');

    expect(useEditorStore.getState().selectedBlockId).toBeNull();
    expect(document.activeElement).toBe(focusEl(IDS.features));
  });

  it('returns focus to the block when Escape is pressed on its toolbar', () => {
    act(() => useEditorStore.getState().selectBlock(IDS.features));
    const duplicate = focusEl(IDS.features).querySelector<HTMLButtonElement>('button[aria-label="Duplicar"]');
    act(() => duplicate?.focus());
    expect(document.activeElement).toBe(duplicate);

    press(duplicate as HTMLElement, 'Escape');

    expect(useEditorStore.getState().selectedBlockId).toBeNull();
    expect(document.activeElement).toBe(focusEl(IDS.features));
  });

  it('moves the block with Alt+ArrowUp and Alt+ArrowDown and announces it', () => {
    act(() => focusEl(IDS.features).focus());

    press(focusEl(IDS.features), 'ArrowUp', { altKey: true });
    expect(blockOrder()).toEqual([IDS.features, IDS.hero, IDS.cta]);
    expect(statusOf(IDS.features)).toBe('Bloque Características movido a la posición 1 de 3');
    expect(document.activeElement).toBe(focusEl(IDS.features));

    press(focusEl(IDS.features), 'ArrowDown', { altKey: true });
    expect(blockOrder()).toEqual([IDS.hero, IDS.features, IDS.cta]);

    press(focusEl(IDS.hero), 'ArrowUp', { altKey: true });
    expect(blockOrder()).toEqual([IDS.hero, IDS.features, IDS.cta]);
  });

  it('duplicates with Ctrl+D (not the browser bookmark) and asks to delete with Delete', () => {
    act(() => focusEl(IDS.hero).focus());

    const duplicate = press(focusEl(IDS.hero), 'd', { ctrlKey: true });
    expect(duplicate.defaultPrevented).toBe(true);
    expect(useEditorStore.getState().page.blocks).toHaveLength(4);

    press(focusEl(IDS.cta), 'Delete');
    expect(useEditorStore.getState().pendingDeleteBlockId).toBe(IDS.cta);
  });

  it('does not steal keys from text being typed inside a block', () => {
    resetEditorStore(makePage([makeBlock('contact', { title: 'Escríbenos' }, { id: 'b-contact' }), makeBlock('cta', {}, { id: IDS.cta })]));
    view.rerender(<CanvasViewport />);
    const input = focusEl('b-contact').querySelector('input, textarea') as HTMLElement;
    act(() => input.focus());

    press(input, 'ArrowDown');
    press(input, 'Delete');
    press(input, ' ');
    press(input, 'd', { ctrlKey: true });

    expect(document.activeElement).toBe(input);
    expect(useEditorStore.getState().pendingDeleteBlockId).toBeNull();
    expect(useEditorStore.getState().selectedBlockId).toBeNull();
    expect(useEditorStore.getState().page.blocks).toHaveLength(2);
  });

  describe('a block another person is editing', () => {
    beforeEach(() => {
      act(() => {
        useEditorStore.setState({
          myConnectionId: 'me',
          blockLocks: { [IDS.features]: { connectionId: 'other', userId: 'u-2', username: 'Ana' } },
        });
      });
    });

    it('says who is editing it and stays reachable by arrows', () => {
      expect(focusEl(IDS.features).getAttribute('aria-label')).toBe('Bloque Características, 2 de 3, bloqueado, lo está editando Ana');

      act(() => focusEl(IDS.hero).focus());
      press(focusEl(IDS.hero), 'ArrowDown');

      expect(document.activeElement).toBe(focusEl(IDS.features));
    });

    it('refuses to select it from the keyboard and announces why', () => {
      act(() => focusEl(IDS.features).focus());

      press(focusEl(IDS.features), 'Enter');

      expect(useEditorStore.getState().selectedBlockId).toBeNull();
      expect(statusOf(IDS.features)).toBe('Características no se puede seleccionar: lo está editando Ana.');
    });

    it('refuses a mouse click the same way, with the same announcement', () => {
      click(focusEl(IDS.features));

      expect(useEditorStore.getState().selectedBlockId).toBeNull();
      expect(statusOf(IDS.features)).toBe('Características no se puede seleccionar: lo está editando Ana.');
    });

    it('refuses move, duplicate and delete', () => {
      act(() => focusEl(IDS.features).focus());

      press(focusEl(IDS.features), 'ArrowUp', { altKey: true });
      press(focusEl(IDS.features), 'd', { ctrlKey: true });
      press(focusEl(IDS.features), 'Delete');

      expect(blockOrder()).toEqual([IDS.hero, IDS.features, IDS.cta]);
      expect(useEditorStore.getState().pendingDeleteBlockId).toBeNull();
      expect(statusOf(IDS.features)).toContain('lo está editando Ana');
    });

    it('still lets me select my own locked-free blocks', () => {
      press(focusEl(IDS.cta), 'Enter');

      expect(useEditorStore.getState().selectedBlockId).toBe(IDS.cta);
    });
  });

  it('does not make blocks focusable in preview mode', () => {
    act(() => useEditorStore.setState({ isPreviewMode: true }));

    expect(view.container.querySelector('[data-block-focusable]')).toBeNull();
  });
});

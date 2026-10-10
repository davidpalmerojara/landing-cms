import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import LeftSidebar from '@/components/editor/LeftSidebar';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const HERO = 'b-hero';
const CTA = 'b-cta';

function narrowScreen(narrow: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: narrow && query.includes('max-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })));
}

const nextFrame = () => act(() => new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); }));

describe('LeftSidebar', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore(makePage([makeBlock('hero', {}, { id: HERO }), makeBlock('cta', {}, { id: CTA })]));
  });

  afterEach(() => {
    view.unmount();
    vi.unstubAllGlobals();
  });

  describe('as a panel over the canvas (EDITOR2-005)', () => {
    beforeEach(() => {
      narrowScreen(true);
      view = render(<LeftSidebar />);
    });

    const toggle = () => document.querySelector<HTMLButtonElement>('button[aria-controls="editor-left-sidebar"]')!;

    it('"Bloques" stays and says whether the panel is open; focus moves into the panel', async () => {
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      act(() => { toggle().focus(); });
      click(toggle());

      expect(toggle()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement?.getAttribute('role')).toBe('tab');
    });

    it('Esc closes it wherever focus is, and focus goes back to "Bloques"', async () => {
      click(toggle());
      act(() => { (document.activeElement as HTMLElement | null)?.blur(); });

      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      await nextFrame();

      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggle());
    });
  });

  describe('on a wide screen', () => {
    beforeEach(() => {
      narrowScreen(false);
      view = render(<LeftSidebar />);
    });

    it('EDITOR2-014: its tabs have their own name, not the top bar\'s "Vista del editor"', () => {
      expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Secciones del panel lateral');
    });

    it('COLLAB2-005: the layer of a block someone else is editing says who', () => {
      act(() => {
        useEditorStore.setState({
          leftTab: 'layers',
          myConnectionId: 'conn-me',
          blockLocks: {
            [HERO]: { connectionId: 'conn-ana', userId: 'u-ana', username: 'Ana' },
            [CTA]: { connectionId: 'conn-me', userId: 'u-me', username: 'Yo' },
          },
        });
      });
      const layers = Array.from(document.querySelectorAll('[data-layer-item]'));
      expect(layers[0].textContent).toContain('bloqueado, lo está editando Ana');
      // Our own lock is not shown as someone else's
      expect(layers[1].textContent).not.toContain('bloqueado');
    });
  });
});

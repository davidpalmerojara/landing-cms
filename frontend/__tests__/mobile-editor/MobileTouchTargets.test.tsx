import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileBlockEditor from '@/components/mobile-editor/MobileBlockEditor';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, setNavigatorOnline, type RenderResult } from './test-utils';

/** Tailwind classes that give an element a 44px (11 x 4px) tall or wide hit area. */
const TOUCH_SIZE = /(?:^|\s)(?:min-h-11|min-w-11|h-11|h-12|h-14|py-3\.5|py-4)(?:\s|$)/;

function hasTouchTarget(el: Element): boolean {
  const own = el.getAttribute('class') ?? '';
  const label = el.closest('label');
  return TOUCH_SIZE.test(own) || (label != null && TOUCH_SIZE.test(label.getAttribute('class') ?? ''));
}

function expectTouchTargets(root: HTMLElement) {
  const controls = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], select, textarea, input:not([type="hidden"])'))
    .filter((el) => el.getAttribute('aria-hidden') !== 'true');
  expect(controls.length).toBeGreaterThan(0);
  const small = controls.filter((el) => !hasTouchTarget(el) && !/(?:^|\s)(?:py-3|px-4 py-3)(?:\s|$)/.test(el.getAttribute('class') ?? ''));
  expect(small.map((el) => el.outerHTML.slice(0, 140))).toEqual([]);
}

describe('mobile editor touch targets', () => {
  let view: RenderResult;

  beforeEach(() => {
    setNavigatorOnline(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  describe('block editor', () => {
    beforeEach(() => {
      resetEditorStore(makePage([
        makeBlock('pricing', {
          title: 'Precios',
          plans: [{ name: 'Pro', price: '9', features: 'a', buttonText: 'Elegir', buttonLink: '', highlighted: false }],
        }, { id: 'pricing' }),
      ]));
      view = render(<MobileBlockEditor blockId="pricing" />);
      click(view.container.querySelector('#mobile-field-plans-0-toggle') as Element);
    });

    it('makes the whole switch row a 44px target, not just the 24px track', () => {
      const toggle = view.container.querySelector('input[role="switch"]') as HTMLInputElement;
      const row = toggle.closest('label') as HTMLLabelElement;

      expect(row).not.toBeNull();
      expect(row.className).toContain('min-h-11');
      expect(row.textContent).toBe('Destacado');
      expect(toggle.checked).toBe(false);

      click(row);

      expect(toggle.checked).toBe(true);
    });

    it('gives the style sliders a 44px hit area and a name', () => {
      click(Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Estilos') as Element);
      const sliders = Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="range"]'));

      expect(sliders.length).toBeGreaterThan(0);
      for (const slider of sliders) {
        expect(slider.className).toContain('h-11');
        const labelledBy = slider.getAttribute('aria-labelledby') ?? '';
        expect(document.getElementById(labelledBy)?.textContent, 'slider has no name').toBeTruthy();
      }
    });

    it('has no control smaller than the touch size', () => {
      click(Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Estilos') as Element);

      expectTouchTargets(view.container);
    });
  });

  describe('editor shell', () => {
    beforeEach(() => {
      resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' }), makeBlock('cta', {})], { name: 'Mi landing' }));
      view = render(
        <MobileEditor pageId="page-123" onSave={vi.fn().mockResolvedValue(true)} onPublish={vi.fn().mockResolvedValue(true)} />,
      );
    });

    it('has no control smaller than the touch size in the header and block list', () => {
      expectTouchTargets(view.container);
    });

    it('keeps the visible page name in the accessible name of its button', () => {
      const button = view.container.querySelector('button[aria-label^="Editar nombre"]') as HTMLElement;

      expect(button.getAttribute('aria-label')).toContain('Mi landing');
      expect(button.textContent).toBe('Mi landing');
    });
  });
});

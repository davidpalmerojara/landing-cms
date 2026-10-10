import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import Inspector from '@/components/inspector/Inspector';
import ImageField from '@/components/inspector/ImageField';
import ColorField from '@/components/inspector/ColorField';
import SeoPanel from '@/components/editor/SeoPanel';
import { useEditorStore } from '@/store/editor-store';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

/** Accessible name, simplified: aria-labelledby, then aria-label, then <label>, then content. */
function nameOf(el: Element): string {
  const own = () => el.getAttribute('aria-label') ?? el.textContent ?? '';
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => {
        const target = document.getElementById(id);
        if (!target) return '';
        return target === el ? own() : nameOf(target);
      })
      .join(' ')
      .trim();
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return Array.from(labels).map((l) => l.textContent ?? '').join(' ').trim();
  return (el.textContent ?? '').trim();
}

const descriptionOf = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Every label points at a control that exists, and every control has a name. */
function expectEveryControlNamed(root: HTMLElement) {
  for (const label of Array.from(root.querySelectorAll('label[for]'))) {
    expect(document.getElementById(label.getAttribute('for') ?? ''), `label "${label.textContent}" has no control`).not.toBeNull();
  }
  const controls = Array.from(root.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([aria-hidden="true"]), select, textarea, button, [role="switch"]'));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(nameOf(control), `${control.outerHTML.slice(0, 120)} has no accessible name`).not.toBe('');
  }
}

describe('inspector field labels', () => {
  let view: RenderResult;

  afterEach(() => view.unmount());

  describe('image fields', () => {
    function loadTeam(image: string) {
      resetEditorStore(makePage([
        makeBlock('team', { title: 'Equipo', members: [{ name: 'Ana', role: 'CEO', image }] }, { id: 'team' }),
      ]));
      useEditorStore.setState({ selectedBlockId: 'team' });
      view = render(<Inspector />);
      click(view.container.querySelector('#field-members-0-toggle') as Element);
    }

    it('ties the picker button of a list item to the field label and the current value', () => {
      loadTeam('');
      const button = view.container.querySelector('#field-members-0-image') as HTMLElement;

      expect(button.tagName).toBe('BUTTON');
      expect(nameOf(button)).toBe('Seleccionar imagen Foto');
      expect(descriptionOf(button)).toBe('Ninguna imagen seleccionada');
      expect(view.container.querySelector('label[for="field-members-0-image"]')?.textContent).toBe('Foto');
    });

    it('keeps the change and remove buttons named by their action plus the field', () => {
      loadTeam('https://cdn.example.com/media/ana%20lopez.jpg?v=2');
      const change = view.container.querySelector('#field-members-0-image') as HTMLElement;
      const remove = view.container.querySelector('#field-members-0-image-remove') as HTMLElement;

      expect(nameOf(change)).toBe('Cambiar Foto');
      expect(descriptionOf(change)).toBe('Imagen actual: ana%20lopez.jpg');
      expect(nameOf(remove)).toBe('Quitar imagen Foto');
    });

    it('names every control of the whole inspector', () => {
      loadTeam('');

      expectEveryControlNamed(view.container);
    });
  });

  describe('hero inspector (content and styles)', () => {
    beforeEach(() => {
      resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' }, { id: 'hero' })]));
      useEditorStore.setState({ selectedBlockId: 'hero' });
      view = render(<Inspector />);
    });

    it('associates the background image and the background color with their labels', () => {
      const image = view.container.querySelector('#field-backgroundImage') as HTMLElement;
      const color = view.container.querySelector('#style-bgColor') as HTMLElement;

      expect(nameOf(image)).toContain('Imagen de Fondo');
      expect(nameOf(color)).toBe('Color de fondo Del tema');
      expect(view.container.querySelector('label[for="style-bgColor"]')).not.toBeNull();
    });

    it('names every control, including the spacing and radius controls', () => {
      expectEveryControlNamed(view.container);
      const top = Array.from(view.container.querySelectorAll('input[type="number"]')).map(nameOf);

      expect(top.some((name) => /Padding|Relleno/i.test(name) && /Arriba/.test(name))).toBe(true);
    });
  });

  describe('color field', () => {
    beforeEach(() => {
      view = render(
        <>
          <span id="c-label">Color del título</span>
          <ColorField id="c" labelId="c-label" value="#2563eb" onChange={() => {}} />
        </>,
      );
    });

    it('is a button named by the label and its value, and opens a labelled palette', () => {
      const trigger = view.container.querySelector('#c') as HTMLElement;

      expect(trigger.tagName).toBe('BUTTON');
      expect(nameOf(trigger)).toBe('Color del título #2563EB');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');

      click(trigger);

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      const palette = document.getElementById(trigger.getAttribute('aria-controls') ?? '') as HTMLElement;
      expect(nameOf(palette)).toBe('Color del título');
      const pressed = palette.querySelectorAll('[aria-pressed="true"]');
      expect(pressed).toHaveLength(1);
      expect(pressed[0].getAttribute('aria-label')).toBe('Color #2563EB');
      expect(palette.querySelector('input[aria-label="Código de color hexadecimal"]')).not.toBeNull();
    });

    it('makes the swatches one tab stop and moves between them with arrows', () => {
      click(view.container.querySelector('#c') as Element);
      const swatches = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[data-swatch]'));

      expect(swatches.filter((s) => s.tabIndex === 0)).toHaveLength(1);
      expect(swatches.find((s) => s.tabIndex === 0)?.getAttribute('aria-label')).toBe('Color #2563EB');

      act(() => swatches[0].focus());
      act(() => {
        swatches[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(swatches[1]);
    });

    it('closes with Escape and gives focus back to the button', () => {
      const trigger = view.container.querySelector('#c') as HTMLElement;
      click(trigger);
      const first = view.container.querySelector<HTMLElement>('[data-swatch]') as HTMLElement;
      act(() => first.focus());

      act(() => {
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('ImageField on its own', () => {
    it('works without a label id, keeping its own name', () => {
      view = render(<ImageField id="solo" value="" onChange={() => {}} />);

      expect(nameOf(view.container.querySelector('#solo') as Element)).toBe('Seleccionar imagen');
    });
  });
});

describe('SEO panel', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore(makePage([], { name: 'Mi página' }));
    view = render(<SeoPanel />);
  });

  afterEach(() => view.unmount());

  it('links every label to its input', () => {
    const labels = Array.from(view.container.querySelectorAll('label'));

    expect(labels.length).toBeGreaterThanOrEqual(7);
    for (const label of labels) {
      expect(label.htmlFor, `label "${label.textContent}" has no htmlFor`).not.toBe('');
    }
    expectEveryControlNamed(view.container);
    const titleInput = view.container.querySelector('label[for]') as HTMLLabelElement;
    expect(nameOf(document.getElementById(titleInput.htmlFor) as Element)).toBe('Título SEO');
  });

  it('exposes the character count of each field through aria-describedby', () => {
    const labelled = (text: string) => {
      const label = Array.from(view.container.querySelectorAll('label')).find((l) => l.textContent === text) as HTMLLabelElement;
      return document.getElementById(label.htmlFor) as HTMLInputElement;
    };
    const title = labelled('Título SEO');
    expect(descriptionOf(title)).toContain('0 de 70 caracteres');

    act(() => useEditorStore.getState().updateSeo('seoTitle', 'x'.repeat(65)));
    expect(descriptionOf(title)).toContain('65 de 70 caracteres, cerca del límite');

    act(() => useEditorStore.getState().updateSeo('seoTitle', 'x'.repeat(72)));
    expect(descriptionOf(title)).toContain('supera el límite recomendado');

    expect(descriptionOf(labelled('Meta description'))).toContain('de 160 caracteres');
  });

  it('exposes the hide-from-search toggle as a labelled switch with its hint', () => {
    const toggle = view.container.querySelector('#seo-noindex') as HTMLElement;

    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(nameOf(toggle)).toBe('Ocultar de buscadores');
    expect(descriptionOf(toggle)).toBe('Agrega noindex, nofollow');

    click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('tells assistive technology which sections are open', () => {
    const toggles = Array.from(view.container.querySelectorAll<HTMLElement>('button[aria-controls^="seo-section-"]'));

    expect(toggles).toHaveLength(3);
    for (const toggle of toggles) {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeNull();
    }
    click(toggles[0]);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('seo-section-seo')).toBeNull();
  });

  it('names the button that removes the social image', () => {
    act(() => useEditorStore.getState().updateSeo('ogImage', 'https://example.com/og.png'));
    const remove = view.container.querySelector('#seo-og-image') as HTMLElement;

    expect(remove.tagName).toBe('BUTTON');
    expect(nameOf(remove)).toBe('Quitar imagen OG');
  });
});

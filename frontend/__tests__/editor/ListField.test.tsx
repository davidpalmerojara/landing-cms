import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import Inspector from '@/components/inspector/Inspector';
import MobileBlockEditor from '@/components/mobile-editor/MobileBlockEditor';
import { useEditorStore } from '@/store/editor-store';
import { getAtPath } from '@/lib/block-data';
import { click, makeBlock, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const BLOCK_ID = 'faq-block';

function loadFaq(count: number) {
  const questions = Array.from({ length: count }, (_, i) => ({ question: `Pregunta número ${i + 1}`, answer: `R${i + 1}` }));
  resetEditorStore(makePage([makeBlock('faq', { title: 'FAQ', questions }, { id: BLOCK_ID })]));
  useEditorStore.setState({ selectedBlockId: BLOCK_ID });
}

const storedQuestions = () => {
  const list = getAtPath(useEditorStore.getState().page.blocks[0].data, ['questions']);
  return Array.isArray(list) ? list.map((item) => getAtPath(item, ['question'])) : [];
};

function byLabel(view: RenderResult, label: string): HTMLButtonElement {
  const el = view.container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`No element labelled "${label}"`);
  return el;
}

function buttonByText(view: RenderResult, text: string): HTMLButtonElement {
  const el = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!el) throw new Error(`No button with text "${text}"`);
  return el;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('list field in the inspector', () => {
  let view: RenderResult;

  beforeEach(() => {
    loadFaq(3);
    view = render(<Inspector />);
  });

  afterEach(() => view.unmount());

  it('shows one collapsed item per entry with its position and a counter', () => {
    expect(view.container.textContent).toContain('3 de 12');
    const toggles = view.container.querySelectorAll('[aria-controls$="-panel"]');
    expect(toggles).toHaveLength(3);
    expect(toggles[1].textContent).toContain('Pregunta 2');
    expect(toggles[1].textContent).toContain('Pregunta número 2');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
  });

  it('labels the controls with the item and its position', () => {
    expect(byLabel(view, 'Mover pregunta 2 arriba')).toBeInTheDocument();
    expect(byLabel(view, 'Mover pregunta 2 abajo')).toBeInTheDocument();
    expect(byLabel(view, 'Eliminar pregunta 2')).toBeInTheDocument();
    expect(byLabel(view, 'Mover pregunta 1 arriba').disabled).toBe(true);
    expect(byLabel(view, 'Mover pregunta 3 abajo').disabled).toBe(true);
  });

  it('expands an item and edits its fields at their path', () => {
    const toggle = buttonByText(view, 'Pregunta 2');
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    const input = panel?.querySelector('input');
    if (!input) throw new Error('no input');
    expect(view.container.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Pregunta');
    typeInto(input, 'Cambiada');
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Cambiada', 'Pregunta número 3']);
  });

  it('adds an item, opens it and focuses its first field', () => {
    click(buttonByText(view, 'Añadir pregunta'));
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Pregunta número 2', 'Pregunta número 3', 'Nueva pregunta']);
    const toggle = buttonByText(view, 'Pregunta 4');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(document.activeElement).toBe(panel?.querySelector('input'));
    expect(view.container.querySelector('[aria-live="polite"]')?.textContent).toBe('Nuevo elemento: Pregunta 4');
  });

  it('removes an item and moves focus to the item that took its place', () => {
    click(byLabel(view, 'Eliminar pregunta 2'));
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Pregunta número 3']);
    expect(document.activeElement).toBe(buttonByText(view, 'Pregunta 2'));
  });

  it('moves items and keeps focus on a move button of the moved item', () => {
    click(byLabel(view, 'Mover pregunta 2 abajo'));
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Pregunta número 3', 'Pregunta número 2']);
    // Now last: "down" is disabled, so focus goes to its "up" button
    expect(document.activeElement).toBe(byLabel(view, 'Mover pregunta 3 arriba'));

    click(byLabel(view, 'Mover pregunta 3 arriba'));
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Pregunta número 2', 'Pregunta número 3']);
    expect(document.activeElement).toBe(byLabel(view, 'Mover pregunta 2 arriba'));
    expect(view.container.querySelector('[aria-live="polite"]')?.textContent).toBe('Pregunta ahora está en la posición 2');
  });

  it('keeps an open item open when it moves', () => {
    click(buttonByText(view, 'Pregunta 1'));
    click(byLabel(view, 'Mover pregunta 1 abajo'));
    expect(buttonByText(view, 'Pregunta 2').getAttribute('aria-expanded')).toBe('true');
    expect(buttonByText(view, 'Pregunta 1').getAttribute('aria-expanded')).toBe('false');
  });

  it('each structural change is one undo step', () => {
    click(byLabel(view, 'Eliminar pregunta 1'));
    click(byLabel(view, 'Mover pregunta 1 abajo'));
    act(() => useEditorStore.getState().undo());
    expect(storedQuestions()).toEqual(['Pregunta número 2', 'Pregunta número 3']);
    act(() => useEditorStore.getState().undo());
    expect(storedQuestions()).toEqual(['Pregunta número 1', 'Pregunta número 2', 'Pregunta número 3']);
  });
});

describe('list field limits and empty state', () => {
  it('disables adding at the maximum and says why', () => {
    loadFaq(12);
    const view = render(<Inspector />);
    const add = buttonByText(view, 'Añadir pregunta');
    expect(add.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(add.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Has llegado al máximo de 12.');
    click(add);
    expect(storedQuestions()).toHaveLength(12);
    view.unmount();
  });

  it('shows an empty state and focuses "add" after removing the last item', () => {
    loadFaq(1);
    const view = render(<Inspector />);
    click(byLabel(view, 'Eliminar pregunta 1'));
    expect(view.container.textContent).toContain('Esta lista todavía no tiene elementos.');
    expect(document.activeElement).toBe(buttonByText(view, 'Añadir pregunta'));
    view.unmount();
  });
});

describe('list field in the mobile editor', () => {
  it('uses 44px touch targets for every list control', () => {
    loadFaq(2);
    const view = render(<MobileBlockEditor blockId={BLOCK_ID} />);
    const controls = [
      byLabel(view, 'Mover pregunta 1 abajo'),
      byLabel(view, 'Eliminar pregunta 2'),
      buttonByText(view, 'Pregunta 1'),
      buttonByText(view, 'Añadir pregunta'),
    ];
    for (const control of controls) {
      expect(control.className).toMatch(/min-h-11/);
    }
    click(byLabel(view, 'Eliminar pregunta 1'));
    expect(storedQuestions()).toEqual(['Pregunta número 2']);
    view.unmount();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import ActionMenu from '@/components/ui/ActionMenu';
import { click, render, type RenderResult } from '../mobile-editor/test-utils';

let view: RenderResult;

afterEach(() => {
  view.unmount();
});

function openMenu() {
  view = render(
    <ActionMenu
      label="Opciones"
      items={[
        { key: 'edit', label: 'Editar', onSelect: vi.fn() },
        { key: 'delete', label: 'Eliminar', onSelect: vi.fn(), danger: true },
      ]}
    />,
  );
  const trigger = view.container.querySelector('button[aria-label="Opciones"]') as HTMLButtonElement;
  click(trigger);
  return trigger;
}

function pressKey(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('ActionMenu keyboard', () => {
  it('opens with focus on the first item', () => {
    openMenu();

    expect(document.activeElement?.textContent).toBe('Editar');
  });

  it('APP3-001: Tab closes the menu and leaves focus on the button, so the browser moves on from it', () => {
    const trigger = openMenu();

    const event = pressKey(document.activeElement as Element, 'Tab');

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // Not cancelled: the browser's own Tab then moves to the next element after the button
    expect(event.defaultPrevented).toBe(false);
  });

  it('APP3-001: Shift+Tab does the same', () => {
    const trigger = openMenu();

    pressKey(document.activeElement as Element, 'Tab', { shiftKey: true });

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes the menu and returns focus to the button', () => {
    const trigger = openMenu();

    pressKey(document.activeElement as Element, 'Escape');

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

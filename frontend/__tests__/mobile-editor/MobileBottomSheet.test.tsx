import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileBottomSheet from '@/components/mobile-editor/MobileBottomSheet';
import { keyDown, render } from './test-utils';

describe('MobileBottomSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders as a dialog when open', () => {
    const onClose = vi.fn();
    const view = render(
      <MobileBottomSheet open onClose={onClose} title="Editar bloque" ariaLabel="Editar bloque">
        <button type="button">Focus me</button>
      </MobileBottomSheet>,
    );

    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Editar bloque');
    expect(view.container.textContent).toContain('Editar bloque');

    view.unmount();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    const view = render(
      <MobileBottomSheet open onClose={onClose} title="Cerrar con escape">
        <button type="button">Focusable</button>
      </MobileBottomSheet>,
    );

    keyDown(document, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('does not render when closed', () => {
    const view = render(
      <MobileBottomSheet open={false} onClose={vi.fn()}>
        <button type="button">Hidden</button>
      </MobileBottomSheet>,
    );

    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });
});

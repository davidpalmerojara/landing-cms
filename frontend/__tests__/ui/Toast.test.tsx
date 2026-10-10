import { act } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ToastContainer, toastDuration, type ToastData } from '@/components/ui/Toast';
import { click, render } from '../mobile-editor/test-utils';

function toast(overrides: Partial<ToastData> = {}): ToastData {
  return { id: 't1', message: 'Bloque duplicado', variant: 'info', ...overrides };
}

describe('Toast (QA-068)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an error until it is dismissed', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const view = render(<ToastContainer toasts={[toast({ variant: 'error', message: 'No se pudo guardar' })]} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onDismiss).not.toHaveBeenCalled();

    click(view.container.querySelector('[aria-label="Cerrar"]') as HTMLElement);
    expect(onDismiss).toHaveBeenCalledWith('t1');
    view.unmount();
  });

  it('gives a long message more time than a short one, between 4 and 10 seconds', () => {
    expect(toastDuration(toast({ message: 'Hecho' }))).toBe(4000);
    const long = 'La edición en tiempo real necesita el plan Pro del propietario de la página. Tus cambios se siguen guardando.';
    const longDuration = toastDuration(toast({ message: long })) ?? 0;
    expect(longDuration).toBeGreaterThan(4000);
    expect(longDuration).toBeLessThanOrEqual(10_000);
    expect(toastDuration(toast({ message: 'x'.repeat(2000) }))).toBe(10_000);
  });

  it('dismisses an info toast after its time, not after 3 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const view = render(<ToastContainer toasts={[toast()]} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDismiss).toHaveBeenCalledWith('t1');
    view.unmount();
  });

  it('does not go away while it has focus', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const view = render(<ToastContainer toasts={[toast()]} onDismiss={onDismiss} />);
    const close = view.container.querySelector('[aria-label="Cerrar"]') as HTMLElement;

    act(() => { close.focus(); });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(onDismiss).not.toHaveBeenCalled();
    view.unmount();
  });

  it('draws the info variant on an opaque surface', () => {
    const view = render(<ToastContainer toasts={[toast()]} onDismiss={vi.fn()} />);
    const box = view.container.querySelector('[data-variant="info"]') as HTMLElement;

    expect(box.className).toContain('bg-surface-elevated');
    // No translucent background: the page underneath must not show through the text
    expect(box.className).not.toMatch(/\bbg-[a-z-]+\/\d+/);
    view.unmount();
  });

  it('runs the action and closes the toast', () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    const view = render(
      <ToastContainer toasts={[toast({ action: { label: 'Deshacer', onClick: onUndo } })]} onDismiss={onDismiss} />,
    );

    click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Deshacer') as HTMLElement);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('t1');
    view.unmount();
  });

  it('sits above the add button and the home indicator on phones', () => {
    const view = render(<ToastContainer toasts={[toast()]} onDismiss={vi.fn()} placement="aboveFab" />);
    const region = view.container.querySelector('[aria-live="polite"]') as HTMLElement;

    expect(region.className).toContain('env(safe-area-inset-bottom)');
    expect(region.className).toContain('left-4');
    view.unmount();
  });
});

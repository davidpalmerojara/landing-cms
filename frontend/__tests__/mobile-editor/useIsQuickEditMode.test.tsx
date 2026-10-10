import { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useIsQuickEditMode } from '@/hooks/useIsQuickEditMode';
import { useEditorStore } from '@/store/editor-store';
import { installMatchMedia, render, resetEditorStore } from './test-utils';

function Harness({ onValue }: { onValue: (value: boolean) => void }) {
  const isQuick = useIsQuickEditMode();

  useEffect(() => {
    onValue(isQuick);
  }, [isQuick, onValue]);

  return <div data-testid="value">{isQuick ? 'true' : 'false'}</div>;
}

describe('useIsQuickEditMode', () => {
  let matchMediaController: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    resetEditorStore();
    matchMediaController = installMatchMedia(1024);
  });

  afterEach(() => {
    matchMediaController.restore();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  it('returns true when the viewport is below 768px', () => {
    matchMediaController.setWidth(375);
    const onValue = vi.fn();

    const view = render(<Harness onValue={onValue} />);

    expect(view.container.textContent).toBe('true');
    expect(useEditorStore.getState().isQuickEditMode).toBe(true);
    expect(onValue).toHaveBeenLastCalledWith(true);

    view.unmount();
  });

  it('returns false when the viewport is 768px or wider', () => {
    matchMediaController.setWidth(768);
    const onValue = vi.fn();

    const view = render(<Harness onValue={onValue} />);

    expect(view.container.textContent).toBe('false');
    expect(useEditorStore.getState().isQuickEditMode).toBe(false);
    expect(onValue).toHaveBeenLastCalledWith(false);

    view.unmount();
  });

  it('updates when the viewport changes', () => {
    const onValue = vi.fn();

    const view = render(<Harness onValue={onValue} />);
    expect(view.container.textContent).toBe('false');

    matchMediaController.setWidth(420);
    expect(view.container.textContent).toBe('true');
    expect(useEditorStore.getState().isQuickEditMode).toBe(true);

    matchMediaController.setWidth(1200);
    expect(view.container.textContent).toBe('false');
    expect(useEditorStore.getState().isQuickEditMode).toBe(false);

    view.unmount();
  });

  // QA-022: phones get Quick Edit whatever their orientation; tablets keep the full editor (D4)
  it.each([
    { name: 'phone in portrait', width: 390, height: 844, pointer: 'coarse', expected: true },
    { name: 'phone in landscape (844x390)', width: 844, height: 390, pointer: 'coarse', expected: true },
    { name: 'small Android phone in landscape (863x360)', width: 863, height: 360, pointer: 'coarse', expected: true },
    { name: 'tablet in portrait (768x1024)', width: 768, height: 1024, pointer: 'coarse', expected: false },
    { name: 'tablet in landscape (1024x768)', width: 1024, height: 768, pointer: 'coarse', expected: false },
    { name: 'short desktop window with a mouse', width: 1024, height: 450, pointer: 'fine', expected: false },
    { name: 'narrow desktop window', width: 600, height: 900, pointer: 'fine', expected: true },
  ] as const)('$name -> Quick Edit: $expected (QA-022)', ({ width, height, pointer, expected }) => {
    matchMediaController.setViewport({ width, height, pointer });
    const view = render(<Harness onValue={vi.fn()} />);

    expect(useEditorStore.getState().isQuickEditMode).toBe(expected);

    view.unmount();
  });

  it('keeps Quick Edit when a phone rotates to landscape (QA-022)', () => {
    matchMediaController.setViewport({ width: 390, height: 844, pointer: 'coarse' });
    const view = render(<Harness onValue={vi.fn()} />);
    expect(view.container.textContent).toBe('true');

    matchMediaController.setViewport({ width: 844, height: 390 });
    expect(view.container.textContent).toBe('true');

    view.unmount();
  });
});

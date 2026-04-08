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
});

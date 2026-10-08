import { describe, it, expect, vi } from 'vitest';
import { act, useRef } from 'react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { render } from '../mobile-editor/test-utils';

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, onClose);
  return (
    <div ref={ref} role="dialog">
      <button>first</button>
      <button>last</button>
    </div>
  );
}

function press(target: Element, key: string, shiftKey = false) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });
}

describe('useDialogFocus', () => {
  it('moves focus to the first focusable element when opened', () => {
    const view = render(<Dialog onClose={vi.fn()} />);

    expect(document.activeElement?.textContent).toBe('first');
    view.unmount();
  });

  it('wraps Tab from the last element back to the first', () => {
    const view = render(<Dialog onClose={vi.fn()} />);
    const [first, last] = [...view.container.querySelectorAll('button')];

    act(() => last.focus());
    press(last, 'Tab');
    expect(document.activeElement).toBe(first);

    press(first, 'Tab', true);
    expect(document.activeElement).toBe(last);
    view.unmount();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    const view = render(<Dialog onClose={onClose} />);

    press(view.container.querySelector('button')!, 'Escape');
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('returns focus to the previously focused element on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const view = render(<Dialog onClose={vi.fn()} />);
    view.unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

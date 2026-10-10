import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, decidePendingTouch } from '@/lib/touch-drag';

const base = { dx: 0, dy: 0, elapsed: 0, action: 'reorder' as const, fromHandle: false };

describe('when a finger starts a drag (QA-022)', () => {
  it('a finger moving over a block pans the canvas instead of dragging the block', () => {
    expect(decidePendingTouch({ ...base, dy: 40, elapsed: 120 })).toBe('cancel');
  });

  it('holding still picks the block up after the long press', () => {
    expect(decidePendingTouch({ ...base, dx: 2, elapsed: 100 })).toBe('wait');
    expect(decidePendingTouch({ ...base, dx: 2, elapsed: LONG_PRESS_MS })).toBe('activate');
    expect(decidePendingTouch({ ...base, dy: 60, elapsed: LONG_PRESS_MS + 10 })).toBe('activate');
  });

  it('the toolbar grip drags at once', () => {
    expect(decidePendingTouch({ ...base, dy: 30, elapsed: 50, fromHandle: true })).toBe('activate');
  });

  it('a component tile: sideways drags it towards the canvas, up or down scrolls the list', () => {
    expect(decidePendingTouch({ ...base, action: 'add', dx: 40, dy: 5, elapsed: 80 })).toBe('activate');
    expect(decidePendingTouch({ ...base, action: 'add', dx: 5, dy: 40, elapsed: 80 })).toBe('cancel');
  });
});

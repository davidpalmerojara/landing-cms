import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import WakingServerNotice from '@/components/ui/WakingServerNotice';
import { SLOW_REQUEST_MS } from '@/hooks/useSlowRequest';
import { render } from '../mobile-editor/test-utils';

describe('WakingServerNotice (DEPLOY-005)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays silent for a quick answer and speaks after a few seconds of waiting', () => {
    const view = render(<WakingServerNotice pending />);
    const region = view.container.querySelector('[role="status"]') as HTMLElement;
    expect(region.textContent).toBe('');

    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS - 100); });
    expect(region.textContent).toBe('');

    act(() => { vi.advanceTimersByTime(200); });
    expect(region.textContent).toContain('Despertando el servidor');
    view.unmount();
  });

  it('says it in English too, and goes away when the request ends', () => {
    const view = render(<WakingServerNotice pending />, 'en');
    act(() => { vi.advanceTimersByTime(SLOW_REQUEST_MS + 100); });
    expect(view.container.textContent).toContain('Waking up the server');

    view.rerender(<WakingServerNotice pending={false} />);
    expect(view.container.textContent).toBe('');
    view.unmount();
  });

  it('nothing shows when nothing is pending', () => {
    const view = render(<WakingServerNotice pending={false} />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(view.container.textContent).toBe('');
    view.unmount();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerWarmUp, useServerWarmUp } from '@/hooks/useServerWarmUp';
import { api } from '@/lib/api';
import { render } from '../mobile-editor/test-utils';

function Landing() {
  useServerWarmUp();
  return null;
}

describe('server warm-up (DEPLOY-005, PERF-001)', () => {
  beforeEach(() => resetServerWarmUp());
  afterEach(() => vi.unstubAllGlobals());

  it('pings /healthz once when the landing opens, without cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Landing />).unmount();
    render(<Landing />).unmount();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/healthz\/$/);
    expect(init.credentials).toBe('omit');
  });

  it('reads the answer to the end, so the connection is not left open (the page never went idle)', async () => {
    const response = new Response('{"status":"ok"}', { status: 200 });
    const read = vi.spyOn(response, 'text');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    expect(await api.health.warmUp()).toBe(true);

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a 404 from a server without the endpoint, or no network, breaks nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect(await api.health.warmUp()).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await api.health.warmUp()).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { useEditorStore, uniquePresenceUsers } from '@/store/editor-store';
import { useCollaboration } from '@/hooks/useCollaboration';
import type { RemotePageChange } from '@/lib/page-sync';
import { makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

vi.mock('@/lib/api', () => ({
  api: { auth: { wsTicket: vi.fn() } },
}));

const { api } = await import('@/lib/api');
const wsTicket = vi.mocked(api.auth.wsTicket);

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const BLOCK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const me = { connection_id: 'conn-me', user_id: 'u-me', username: 'yo' };
const ana1 = { connection_id: 'conn-ana-1', user_id: 'u-ana', username: 'Ana' };
const ana2 = { connection_id: 'conn-ana-2', user_id: 'u-ana', username: 'Ana' };

// --- Fake WebSocket ---

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close() {
    this.serverClose(1000);
  }

  // --- Test controls ---
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code: number) {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  sentOfType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

const latest = () => {
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!ws) throw new Error('no socket');
  return ws;
};

// --- Harness ---

const onRemoteChange = vi.fn<(change: RemotePageChange) => void>();

function Harness({ pageId = PAGE_ID }: { pageId?: string }) {
  useCollaboration(pageId, { onRemoteChange });
  return null;
}

const state = () => useEditorStore.getState();

async function connect(extra: Record<string, unknown> = {}) {
  const view = render(<Harness />);
  await act(async () => {});
  const ws = latest();
  act(() => {
    ws.open();
    ws.receive({ type: 'connected', connection_id: me.connection_id, users: [me, ana1], locks: {}, version: 3, ...extra });
  });
  return { view, ws };
}

function receive(ws: FakeWebSocket, message: Record<string, unknown>) {
  act(() => { ws.receive(message); });
}

describe('useCollaboration', () => {
  let view: RenderResult | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    wsTicket.mockReset();
    wsTicket.mockResolvedValue({ ticket: 'ticket', expires_in: 30 });
    onRemoteChange.mockReset();
    resetEditorStore(makePage([
      makeBlock('cta', { title: 'A', subtitle: 'Sub A' }, { id: BLOCK_A }),
      makeBlock('cta', { title: 'B' }, { id: BLOCK_B }),
    ], { id: PAGE_ID }));
  });

  afterEach(() => {
    view?.unmount();
    view = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('presence', () => {
    it('starts with every connection, its own id, the locks and the server version', async () => {
      ({ view } = await connect({ locks: { [BLOCK_B]: ana1 } }));

      expect(state().myConnectionId).toBe('conn-me');
      expect(state().myUserId).toBe('u-me');
      expect(state().presence.map((e) => e.connectionId)).toEqual(['conn-me', 'conn-ana-1']);
      expect(state().blockLocks[BLOCK_B]).toEqual({ connectionId: 'conn-ana-1', userId: 'u-ana', username: 'Ana' });
      expect(state().collabStatus).toBe('connected');
      expect(onRemoteChange).toHaveBeenCalledWith({ version: 3, reason: 'reconnect', by: null, connectionId: null });
    });

    it('keeps one entry per connection; avatars are deduped by user', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      receive(ws, { type: 'user_joined', ...ana2 });

      expect(state().presence).toHaveLength(3);
      expect(uniquePresenceUsers(state().presence).map((e) => e.userId)).toEqual(['u-me', 'u-ana']);
    });

    it('a tab leaving removes only its own entry, cursor and locks', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());
      receive(ws, { type: 'user_joined', ...ana2 });
      receive(ws, { type: 'cursor_moved', ...ana1, x: 10, y: 20 });
      receive(ws, { type: 'cursor_moved', ...ana2, x: 30, y: 40 });
      receive(ws, { type: 'lock_acquired', block_id: BLOCK_B, ...ana1 });
      expect(Object.keys(state().cursorPositions).sort()).toEqual(['conn-ana-1', 'conn-ana-2']);

      receive(ws, { type: 'user_left', ...ana1 });

      expect(state().presence.map((e) => e.connectionId)).toEqual(['conn-me', 'conn-ana-2']);
      expect(Object.keys(state().cursorPositions)).toEqual(['conn-ana-2']);
      expect(state().blockLocks[BLOCK_B]).toBeUndefined();
    });

    it('ignores malformed entries and cursor positions', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      receive(ws, { type: 'user_joined', user_id: 'no-connection' });
      receive(ws, { type: 'cursor_moved', ...ana1, x: 'far', y: 2 });

      expect(state().presence).toHaveLength(2);
      expect(state().cursorPositions).toEqual({});
    });
  });

  describe('locks', () => {
    it('tracks locks by connection and releases only its own', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      act(() => { state().selectBlock(BLOCK_A); });
      expect(ws.sentOfType('lock_acquire')).toEqual([{ type: 'lock_acquire', block_id: BLOCK_A }]);
      receive(ws, { type: 'lock_acquired', block_id: BLOCK_A, ...me });

      // Renewed while held
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(ws.sentOfType('lock_renew')).toEqual([{ type: 'lock_renew', block_id: BLOCK_A }]);

      act(() => { state().selectBlock(BLOCK_B); });
      expect(ws.sentOfType('lock_release')).toEqual([{ type: 'lock_release', block_id: BLOCK_A }]);
      expect(state().blockLocks[BLOCK_A]).toBeUndefined();
    });

    it('a rejected lock shows who is editing, and leaving the block does not release their lock', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      act(() => { state().selectBlock(BLOCK_B); });
      receive(ws, { type: 'lock_rejected', block_id: BLOCK_B, holder: ana1 });

      expect(state().toasts.map((t) => t.message)).toContain('Ana está editando este bloque');
      expect(state().blockLocks[BLOCK_B]?.connectionId).toBe('conn-ana-1');

      act(() => { state().selectBlock(null); });
      expect(ws.sentOfType('lock_release')).toEqual([]);
      expect(state().blockLocks[BLOCK_B]?.connectionId).toBe('conn-ana-1');
    });

    it('another tab of the same user holding a lock is another connection', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      receive(ws, { type: 'lock_acquired', block_id: BLOCK_B, connection_id: 'conn-me-2', user_id: 'u-me', username: 'yo' });
      act(() => { vi.advanceTimersByTime(10_000); });

      expect(state().blockLocks[BLOCK_B]?.connectionId).toBe('conn-me-2');
      expect(ws.sentOfType('lock_renew')).toEqual([]);
    });
  });

  describe('live edits', () => {
    it('block_updated replaces the block data (normalized) instead of merging it', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      receive(ws, { type: 'block_updated', block_id: BLOCK_A, data: { title: 'Remote', bogus: 1 }, styles: { paddingTop: 12 }, ...ana1 });

      const block = state().page.blocks[0];
      expect(block.data).toEqual({ title: 'Remote', subtitle: '', buttonText: '', buttonLink: '' });
      expect(block.styles.paddingTop).toBe(12);
      expect(state().past).toEqual([]); // not an undo step
    });

    it('ignores its own relayed edit', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      receive(ws, { type: 'block_updated', block_id: BLOCK_A, data: { title: 'Echo' }, ...me });

      expect((state().page.blocks[0].data as { title: string }).title).toBe('A');
    });

    it('relays edits of the blocks it holds, in the API style shape', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());
      act(() => { state().selectBlock(BLOCK_A); });
      receive(ws, { type: 'lock_acquired', block_id: BLOCK_A, ...me });

      act(() => { state().updateBlock(BLOCK_A, 'title', 'Typing'); });
      act(() => { state().updateBlockResponsiveStyle(BLOCK_A, 'mobile', 'paddingTop', 4); });

      const relayed = ws.sentOfType('block_updated');
      expect(relayed[0]).toMatchObject({ block_id: BLOCK_A, data: { title: 'Typing' } });
      expect(relayed[1]).toMatchObject({ block_id: BLOCK_A, styles: { responsive: { mobile: { paddingTop: 4 } } } });
    });
  });

  describe('page changes', () => {
    it('passes page_updated from other connections on, and drops its own echo', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());
      onRemoteChange.mockReset();

      receive(ws, { type: 'page_updated', version: 4, reason: 'restore', by: { user_id: 'u-ana', username: 'Ana' }, connection_id: 'conn-ana-1' });
      receive(ws, { type: 'page_updated', version: 5, reason: 'save', by: { user_id: 'u-me', username: 'yo' }, connection_id: 'conn-me' });
      receive(ws, { type: 'page_updated', version: 'x' });

      expect(onRemoteChange).toHaveBeenCalledTimes(1);
      expect(onRemoteChange).toHaveBeenCalledWith({
        version: 4, reason: 'restore', by: { userId: 'u-ana', username: 'Ana' }, connectionId: 'conn-ana-1',
      });
    });
  });

  describe('connection state', () => {
    it('access_revoked: tells the user and never reconnects', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());

      act(() => {
        ws.receive({ type: 'error', code: 'access_revoked' });
        ws.serverClose(4003);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

      expect(state().collabStatus).toBe('revoked');
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(wsTicket).toHaveBeenCalledTimes(1);
    });

    it('plan_limit: explains it once and does not retry', async () => {
      view = render(<Harness />);
      await act(async () => {});
      const ws = latest();
      act(() => {
        ws.open();
        ws.receive({ type: 'error', code: 'plan_limit', message: 'Pro' });
        ws.serverClose(4003);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

      expect(state().collabStatus).toBe('unavailable');
      expect(state().toasts.map((t) => t.message).join(' ')).toContain('plan Pro');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('a dropped connection clears its locks and presence, reconnects and takes the selected block again', async () => {
      let ws: FakeWebSocket;
      ({ view, ws } = await connect());
      act(() => { state().selectBlock(BLOCK_A); });
      receive(ws, { type: 'lock_acquired', block_id: BLOCK_A, ...me });

      act(() => { ws.serverClose(1006); });

      expect(state().collabStatus).toBe('reconnecting');
      expect(state().presence).toEqual([]);
      expect(state().blockLocks).toEqual({});
      expect(state().myConnectionId).toBeNull();

      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      const next = latest();
      expect(next).not.toBe(ws);
      onRemoteChange.mockReset();
      act(() => {
        next.open();
        next.receive({ type: 'connected', connection_id: 'conn-me-new', users: [{ ...me, connection_id: 'conn-me-new' }], locks: {}, version: 8 });
      });

      expect(state().collabStatus).toBe('connected');
      expect(next.sentOfType('lock_acquire')).toEqual([{ type: 'lock_acquire', block_id: BLOCK_A }]);
      expect(onRemoteChange).toHaveBeenCalledWith(expect.objectContaining({ version: 8, reason: 'reconnect' }));
      // The old lock is no longer renewed on the new socket until the server grants it again
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(next.sentOfType('lock_renew')).toEqual([]);
    });

    it('goes offline after the maximum number of failed attempts', async () => {
      view = render(<Harness />);
      await act(async () => {});
      for (let i = 0; i < 10; i++) {
        act(() => { latest().serverClose(1006); });
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      }

      expect(state().collabStatus).toBe('offline');
    });
  });

  it('opens one socket when the effect re-runs before the first ticket arrives', async () => {
    // The first run is cleaned up (page change here; React's double mount in
    // development does the same) while awaiting its ticket: when that ticket
    // arrives it must not open a socket, or the editor sees its own cursor as
    // someone else's
    const pending: Array<(value: { ticket: string; expires_in: number }) => void> = [];
    wsTicket.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
    const OTHER_PAGE = '22222222-2222-4222-8222-222222222222';

    const view = render(<Harness />);
    await act(async () => {});
    act(() => { view.rerender(<Harness pageId={OTHER_PAGE} />); });
    await act(async () => {});
    expect(pending.length).toBe(2);
    await act(async () => { pending.forEach((resolve, i) => resolve({ ticket: `t${i}`, expires_in: 30 })); });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain(OTHER_PAGE);
    view.unmount();
  });
});

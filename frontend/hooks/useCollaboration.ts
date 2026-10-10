'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import type { PresenceEntry } from '@/store/editor-store';
import { api } from '@/lib/api';
import { blockStylesToApi, isPlainObject } from '@/lib/block-data';
import { isGuestUsername } from '@/lib/collab-names';
import type { PageChangeReason, RemotePageChange } from '@/lib/page-sync';
import type { BlockData } from '@/types/blocks';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001';
const LOCK_RENEW_INTERVAL = 10_000; // 10s
const PING_INTERVAL = 25_000; // 25s
const RECONNECT_BASE_DELAY = 2_000; // 2s initial
const RECONNECT_MAX_DELAY = 60_000; // 60s max
/**
 * Quick attempts before the editor says it is offline. It keeps trying every
 * RECONNECT_MAX_DELAY after that, and at once when the browser is back online,
 * the tab becomes visible again or the user presses "Reconectar" (QA-035).
 */
export const MAX_RECONNECT_ATTEMPTS = 8;
/** Close codes after which retrying on its own cannot help: unauthenticated, no access, server error. */
const FINAL_CLOSE_CODES = new Set([4001, 4003, 4500]);
const CLOSE_FORBIDDEN = 4003;
const PAGE_CHANGE_REASONS: readonly PageChangeReason[] = ['save', 'restore', 'publish', 'ai'];
const isDev = process.env.NODE_ENV === 'development';

function logCollabWarning(...args: unknown[]) {
  if (isDev) {
    console.warn(...args);
  }
}

interface CollabMessage {
  type: string;
  [key: string]: unknown;
}

// --- Parsing (the socket is a trust boundary) ---

function parseMessage(raw: unknown): CollabMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) && typeof parsed.type === 'string' ? (parsed as CollabMessage) : null;
  } catch (e) {
    logCollabWarning('[collab] Ignoring a message that is not JSON', e);
    return null;
  }
}

/** A presence entry `{connection_id, user_id, username}`, or null when malformed. */
export function parsePresenceEntry(raw: unknown): PresenceEntry | null {
  if (!isPlainObject(raw)) return null;
  const { connection_id: connectionId, user_id: userId, username } = raw;
  if (typeof connectionId !== 'string' || typeof userId !== 'string') return null;
  return { connectionId, userId, username: typeof username === 'string' ? username : '' };
}

function parseEntries(raw: unknown): PresenceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const entry = parsePresenceEntry(item);
    return entry ? [entry] : [];
  });
}

function parseLocks(raw: unknown): Record<string, PresenceEntry> {
  if (!isPlainObject(raw)) return {};
  const locks: Record<string, PresenceEntry> = {};
  for (const [blockId, holder] of Object.entries(raw)) {
    const entry = parsePresenceEntry(holder);
    if (entry) locks[blockId] = entry;
  }
  return locks;
}

function parsePageChange(msg: CollabMessage): RemotePageChange | null {
  if (typeof msg.version !== 'number') return null;
  const reason = PAGE_CHANGE_REASONS.find((r) => r === msg.reason) ?? 'save';
  const by = isPlainObject(msg.by) && typeof msg.by.user_id === 'string'
    ? { userId: msg.by.user_id, username: typeof msg.by.username === 'string' ? msg.by.username : '' }
    : null;
  return {
    version: msg.version,
    reason,
    by,
    connectionId: typeof msg.connection_id === 'string' ? msg.connection_id : null,
  };
}

// --- Hook ---

export interface CollaborationOptions {
  /** The server announced another version: page_updated, or a different one after (re)connecting. */
  onRemoteChange?: (change: RemotePageChange) => void;
}

export function useCollaboration(pageId: string, { onRemoteChange }: CollaborationOptions = {}) {
  const t = useTranslations();
  const onRemoteChangeRef = useRef(onRemoteChange);
  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const wsRef = useRef<WebSocket | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldLocksRef = useRef<Set<string>>(new Set());
  /**
   * Blocks asked for only to check a lock shown as someone else's: a lock that
   * expired without anyone renewing it is not announced (ADR-024), so asking
   * is how a stale one is found out.
   */
  const probesRef = useRef<Set<string>>(new Set());
  /** "Invitado N" numbers by user id, in the order guests were first seen here. */
  const guestNumbersRef = useRef<Map<string, number>>(new Map());
  /** Access was revoked or the plan has no collaboration: never reconnect. */
  const stopReconnectRef = useRef(false);
  const mountedRef = useRef(true);

  const send = useCallback((msg: CollabMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const acquireLock = useCallback((blockId: string) => {
    send({ type: 'lock_acquire', block_id: blockId });
  }, [send]);

  const releaseLock = useCallback((blockId: string) => {
    // A lock we never got (rejected: someone else holds it) is not ours to release
    if (!heldLocksRef.current.has(blockId)) return;
    send({ type: 'lock_release', block_id: blockId });
    heldLocksRef.current.delete(blockId);
    // Optimistically clear from store so outline disappears immediately
    useEditorStore.getState().setBlockLock(blockId, null);
  }, [send]);

  const sendBlockUpdate = useCallback((blockId: string, data?: BlockData, styles?: Record<string, unknown>) => {
    send({ type: 'block_updated', block_id: blockId, data, styles });
  }, [send]);

  const sendCursorMove = useCallback((x: number, y: number) => {
    send({ type: 'cursor_move', x, y });
  }, [send]);

  /** The name people see: a guest's generated username becomes "Invitado N" (QA-108). */
  const displayName = useCallback((userId: string, username: string): string => {
    if (!isGuestUsername(username)) return username;
    const numbers = guestNumbersRef.current;
    if (!numbers.has(userId)) numbers.set(userId, numbers.size + 1);
    return tRef.current('collab.guestName', { number: numbers.get(userId) ?? 1 });
  }, []);

  const named = useCallback(
    (entry: PresenceEntry): PresenceEntry => ({ ...entry, username: displayName(entry.userId, entry.username) }),
    [displayName],
  );

  /** A lock holder as the block shows it: this person's other tab is called that, not by their own name (QA-109). */
  const lockHolder = useCallback((entry: PresenceEntry): PresenceEntry => {
    const { myUserId, myConnectionId } = useEditorStore.getState();
    if (entry.userId === myUserId && entry.connectionId !== myConnectionId) {
      return { ...entry, username: tRef.current('collab.yourOtherTab') };
    }
    return named(entry);
  }, [named]);

  /** Toast: the block is someone else's right now. */
  const tellLocked = useCallback((holder: PresenceEntry | null) => {
    const store = useEditorStore.getState();
    let message: string;
    if (holder && holder.userId === store.myUserId) message = tRef.current('collab.lockRejectedOwnTab');
    else if (holder?.username) message = tRef.current('collab.lockRejected', { name: holder.username });
    else message = tRef.current('collab.lockRejectedAnonymous');
    store.addToast(message, 'info');
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((msg: CollabMessage) => {
    const store = useEditorStore.getState();
    const own = store.myConnectionId;

    switch (msg.type) {
      case 'connected': {
        const connectionId = typeof msg.connection_id === 'string' ? msg.connection_id : null;
        store.setPresence(connectionId, parseEntries(msg.users).map(named));
        // After setPresence: naming a holder needs to know which connection is ours
        const locks = Object.fromEntries(
          Object.entries(parseLocks(msg.locks)).map(([blockId, holder]) => [blockId, lockHolder(holder)]),
        );
        store.setBlockLocks(locks);
        store.setCollabStatus('connected');
        // Locks die with the socket: take the selected block's again
        const selected = useEditorStore.getState().selectedBlockId;
        if (selected) acquireLock(selected);
        if (typeof msg.version === 'number') {
          onRemoteChangeRef.current?.({ version: msg.version, reason: 'reconnect', by: null, connectionId: null });
        }
        break;
      }

      case 'user_joined': {
        const entry = parsePresenceEntry(msg);
        if (entry) store.addPresence(named(entry));
        break;
      }

      case 'user_left': {
        const entry = parsePresenceEntry(msg);
        if (entry) store.removePresence(entry.connectionId);
        break;
      }

      case 'lock_acquired': {
        const entry = parsePresenceEntry(msg);
        const blockId = msg.block_id;
        if (typeof blockId !== 'string' || !entry) break;
        store.setBlockLock(blockId, lockHolder(entry));
        if (entry.connectionId !== own) break;
        // Track our own locks for renewal
        heldLocksRef.current.add(blockId);
        if (probesRef.current.delete(blockId)) {
          // The lock we were shown had expired: the block is free, so do what the user asked
          const { selectedBlockId, selectBlock } = useEditorStore.getState();
          const free = selectedBlockId === null || selectedBlockId === blockId;
          if (!free || !selectBlock(blockId)) releaseLock(blockId);
        }
        break;
      }

      case 'lock_released': {
        const blockId = msg.block_id;
        if (typeof blockId !== 'string') break;
        const wasOurs = heldLocksRef.current.delete(blockId);
        store.setBlockLock(blockId, null);
        // Our lock lapsed (renewals did not arrive in time) and the block is
        // still selected here: take it again, or hear who has it now (QA-031)
        if (wasOurs && useEditorStore.getState().selectedBlockId === blockId) acquireLock(blockId);
        break;
      }

      case 'lock_rejected': {
        const holder = parsePresenceEntry(msg.holder);
        const shown = holder ? lockHolder(holder) : null;
        const blockId = msg.block_id;
        let wasProbe = false;
        if (typeof blockId === 'string') {
          heldLocksRef.current.delete(blockId);
          wasProbe = probesRef.current.delete(blockId);
          if (shown) store.setBlockLock(blockId, shown);
          // Lost a near-simultaneous click, or our lapsed lock went to someone
          // else: let the block go so nothing typed here overwrites them (QA-011)
          const now = useEditorStore.getState();
          if (now.selectedBlockId === blockId) useEditorStore.setState({ selectedBlockId: null });
          if (now.pendingDeleteBlockId === blockId) now.cancelDeleteBlock();
        }
        // A probe follows a refusal that was already announced
        if (!wasProbe) tellLocked(shown);
        break;
      }

      case 'block_updated':
        if (typeof msg.block_id !== 'string' || (own !== null && msg.connection_id === own)) break;
        store.applyRemoteBlockUpdate(
          msg.block_id,
          msg.data,
          msg.styles,
          typeof msg.connection_id === 'string' ? msg.connection_id : '',
        );
        break;

      case 'cursor_moved':
        if (typeof msg.connection_id !== 'string' || typeof msg.x !== 'number' || typeof msg.y !== 'number') break;
        store.setCursorPosition(msg.connection_id, msg.x, msg.y);
        break;

      case 'page_updated': {
        const change = parsePageChange(msg);
        if (change && (change.connectionId === null || change.connectionId !== own)) {
          const by = change.by ? { ...change.by, username: displayName(change.by.userId, change.by.username) } : null;
          onRemoteChangeRef.current?.({ ...change, by });
        }
        break;
      }

      case 'pong':
        break;

      case 'error':
        if (msg.code === 'access_revoked' || msg.code === 'page_deleted') {
          stopReconnectRef.current = true;
          store.setAccessRevoked(msg.code === 'page_deleted' ? 'deleted' : 'unshared');
        } else if (msg.code === 'plan_limit') {
          stopReconnectRef.current = true;
          store.setCollabStatus('unavailable');
          // The owner of a Free page is told in the share dialog, not on every open (EDITOR2-007);
          // a collaborator who expected live editing is told why it is off
          if (store.page.isOwner === false) store.addToast(tRef.current('collab.planLimit'), 'info');
        } else {
          logCollabWarning('[collab]', msg.code, msg.message);
        }
        break;
    }
  }, [acquireLock, releaseLock, named, lockHolder, displayName, tellLocked]);

  // Auto-acquire/release locks when selectedBlockId changes
  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (state) => state.selectedBlockId,
      (selectedBlockId, prevSelectedBlockId) => {
        // Release previous lock
        if (prevSelectedBlockId && prevSelectedBlockId !== selectedBlockId) {
          releaseLock(prevSelectedBlockId);
        }
        // Acquire new lock
        if (selectedBlockId && selectedBlockId !== prevSelectedBlockId) {
          acquireLock(selectedBlockId);
        }
      },
    );

    return () => unsub();
  }, [acquireLock, releaseLock]);

  // The store refused a block someone else holds (layers, keyboard, Quick Edit...): say so (QA-011)
  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (state) => state.lockRefusal,
      (refusal) => {
        if (!refusal) return;
        tellLocked(refusal.holder);
        // The server knows whether that lock is still alive: it grants it or names the holder
        if (wsRef.current?.readyState === WebSocket.OPEN && !probesRef.current.has(refusal.blockId)) {
          probesRef.current.add(refusal.blockId);
          acquireLock(refusal.blockId);
        }
      },
    );
    return () => unsub();
  }, [acquireLock, tellLocked]);

  // Relay live edits of the blocks we hold; everything else syncs through saves (page_updated)
  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (state) => state.page.blocks,
      (blocks, prevBlocks) => {
        if (blocks === prevBlocks) return;
        // Don't broadcast remote updates back
        if (useEditorStore.getState().isRemoteUpdate) return;

        // Find changed blocks that we hold locks for
        for (const block of blocks) {
          if (!heldLocksRef.current.has(block.id)) continue;
          const prevBlock = prevBlocks.find((b) => b.id === block.id);
          if (!prevBlock) continue;
          const dataChanged = block.data !== prevBlock.data || block.type !== prevBlock.type;
          const stylesChanged = block.styles !== prevBlock.styles || block.responsiveStyles !== prevBlock.responsiveStyles;
          if (dataChanged || stylesChanged) {
            sendBlockUpdate(
              block.id,
              dataChanged ? block.data : undefined,
              stylesChanged ? blockStylesToApi(block) : undefined,
            );
          }
        }
      },
    );

    return () => unsub();
  }, [sendBlockUpdate]);

  // Connect WebSocket
  useEffect(() => {
    mountedRef.current = true;
    stopReconnectRef.current = false;
    // Per run of this effect, not shared like mountedRef: a run that was
    // cleaned up while awaiting its ticket must not open a socket when the
    // ticket arrives, even if a newer run has set mountedRef again (React
    // mounts effects twice in development, and pageId can change).
    let disposed = false;
    let attemptCount = 0;
    let wasConnected = false;
    /** A ticket request is under way (the socket itself is tracked by wsRef) */
    let fetchingTicket = false;
    const enabled = !!pageId && !pageId.startsWith('page_');
    const setStatus = useEditorStore.getState().setCollabStatus;
    // The same Set objects for the whole life of the hook
    const heldLocks = heldLocksRef.current;
    const probes = probesRef.current;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (disposed || stopReconnectRef.current) return;
      clearReconnectTimer();
      if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
        // Tell the user, and keep trying slowly: a long outage ends eventually (QA-035)
        if (attemptCount === MAX_RECONNECT_ATTEMPTS) logCollabWarning('[collab] Still offline, retrying every minute');
        setStatus('offline');
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_MAX_DELAY);
        return;
      }
      setStatus(wasConnected ? 'reconnecting' : 'connecting');
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s...
      const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attemptCount), RECONNECT_MAX_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    /** Busy: a ticket is being fetched or a socket is open or opening. */
    function isBusy(): boolean {
      const ws = wsRef.current;
      return fetchingTicket || (!!ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING));
    }

    async function connect() {
      reconnectTimerRef.current = null;
      if (!enabled || disposed || stopReconnectRef.current || isBusy()) return;
      // Once offline, the label stays until a socket really opens
      if (useEditorStore.getState().collabStatus !== 'offline') setStatus(wasConnected ? 'reconnecting' : 'connecting');

      // A fresh single-use ticket per attempt: the socket may be on another
      // domain where the session cookie is not sent (ADR-010)
      let ticket: string;
      fetchingTicket = true;
      try {
        ({ ticket } = await api.auth.wsTicket());
      } catch (e) {
        logCollabWarning('[collab] Could not get a WebSocket ticket', e);
        fetchingTicket = false;
        attemptCount++;
        scheduleReconnect();
        return;
      }
      fetchingTicket = false;
      if (disposed) return;

      const url = `${WS_BASE}/ws/pages/${pageId}/?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        attemptCount = 0; // Reset on successful connection
        wasConnected = true;

        // Start ping interval
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);

        // Start lock renewal interval
        renewTimerRef.current = setInterval(() => {
          heldLocksRef.current.forEach((blockId) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'lock_renew', block_id: blockId }));
            }
          });
        }, LOCK_RENEW_INTERVAL);
      };

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseMessage(event.data);
        if (msg) handleMessage(msg);
      };

      ws.onclose = (event) => {
        // A socket of a run that was already cleaned up: its timers, locks and
        // store state were cleared then; touching the shared refs now would
        // break the newer run's connection.
        if (disposed) return;
        cleanup();
        if (wsRef.current === ws) wsRef.current = null;
        // The server dropped this connection's locks and presence: forget them too
        heldLocksRef.current.clear();
        probesRef.current.clear();
        useEditorStore.getState().clearCollaboration();

        const status = useEditorStore.getState().collabStatus;
        if (stopReconnectRef.current) return; // revoked / plan limit: status already set

        // Server explicitly rejected (auth failure, no access, infra error) — don't retry
        if (FINAL_CLOSE_CODES.has(event.code)) {
          logCollabWarning(`[collab] Connection rejected (code ${event.code}), not retrying`);
          // 4003 without a message: access to the page is gone
          if (event.code === CLOSE_FORBIDDEN && status !== 'unavailable') {
            stopReconnectRef.current = true;
            setStatus('revoked');
          } else {
            setStatus('offline');
          }
          return;
        }

        // A socket that never opened counts as a failed attempt
        if (!opened) attemptCount++;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after this, so just let it handle reconnection
      };
    }

    /** Try now, from the first quick attempt (network back, tab visible again, "Reconectar"). */
    function reconnectNow() {
      if (!enabled || disposed || stopReconnectRef.current || isBusy()) return;
      clearReconnectTimer();
      attemptCount = 0;
      void connect();
    }

    function cleanup() {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (renewTimerRef.current) {
        clearInterval(renewTimerRef.current);
        renewTimerRef.current = null;
      }
    }

    const handleOnline = () => reconnectNow();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') reconnectNow();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    const unsubReconnect = useEditorStore.subscribe((state) => state.collabReconnectRequest, reconnectNow);

    void connect();

    return () => {
      disposed = true;
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubReconnect();
      cleanup();
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      heldLocks.clear();
      probes.clear();
      // Clean collaboration state
      useEditorStore.getState().clearCollaboration();
      useEditorStore.getState().setCollabStatus('idle');
    };
  }, [pageId, handleMessage]);

  return { acquireLock, releaseLock, sendBlockUpdate, sendCursorMove };
}

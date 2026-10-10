'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import type { PresenceEntry } from '@/store/editor-store';
import { api } from '@/lib/api';
import { blockStylesToApi, isPlainObject } from '@/lib/block-data';
import type { PageChangeReason, RemotePageChange } from '@/lib/page-sync';
import type { BlockData } from '@/types/blocks';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001';
const LOCK_RENEW_INTERVAL = 10_000; // 10s
const PING_INTERVAL = 25_000; // 25s
const RECONNECT_BASE_DELAY = 2_000; // 2s initial
const RECONNECT_MAX_DELAY = 60_000; // 60s max
export const MAX_RECONNECT_ATTEMPTS = 8;
/** Close codes after which reconnecting cannot help: unauthenticated, no access, server error. */
const FINAL_CLOSE_CODES = new Set([4001, 4003, 4500]);
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

  // Handle incoming messages
  const handleMessage = useCallback((msg: CollabMessage) => {
    const store = useEditorStore.getState();
    const own = store.myConnectionId;

    switch (msg.type) {
      case 'connected': {
        const connectionId = typeof msg.connection_id === 'string' ? msg.connection_id : null;
        store.setPresence(connectionId, parseEntries(msg.users));
        store.setBlockLocks(parseLocks(msg.locks));
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
        if (entry) store.addPresence(entry);
        break;
      }

      case 'user_left': {
        const entry = parsePresenceEntry(msg);
        if (entry) store.removePresence(entry.connectionId);
        break;
      }

      case 'lock_acquired': {
        const entry = parsePresenceEntry(msg);
        if (typeof msg.block_id !== 'string' || !entry) break;
        store.setBlockLock(msg.block_id, entry);
        // Track our own locks for renewal
        if (entry.connectionId === own) heldLocksRef.current.add(msg.block_id);
        break;
      }

      case 'lock_released': {
        if (typeof msg.block_id !== 'string') break;
        store.setBlockLock(msg.block_id, null);
        heldLocksRef.current.delete(msg.block_id);
        break;
      }

      case 'lock_rejected': {
        const holder = parsePresenceEntry(msg.holder);
        if (typeof msg.block_id === 'string' && holder) store.setBlockLock(msg.block_id, holder);
        store.addToast(
          holder?.username
            ? tRef.current('collab.lockRejected', { name: holder.username })
            : tRef.current('collab.lockRejectedAnonymous'),
          'info',
        );
        break;
      }

      case 'block_updated':
        if (typeof msg.block_id !== 'string' || (own !== null && msg.connection_id === own)) break;
        store.applyRemoteBlockUpdate(msg.block_id, msg.data, msg.styles);
        break;

      case 'cursor_moved':
        if (typeof msg.connection_id !== 'string' || typeof msg.x !== 'number' || typeof msg.y !== 'number') break;
        store.setCursorPosition(msg.connection_id, msg.x, msg.y);
        break;

      case 'page_updated': {
        const change = parsePageChange(msg);
        if (change && (change.connectionId === null || change.connectionId !== own)) {
          onRemoteChangeRef.current?.(change);
        }
        break;
      }

      case 'pong':
        break;

      case 'error':
        if (msg.code === 'access_revoked') {
          stopReconnectRef.current = true;
          store.setCollabStatus('revoked');
        } else if (msg.code === 'plan_limit') {
          stopReconnectRef.current = true;
          store.setCollabStatus('unavailable');
          store.addToast(tRef.current('collab.planLimit'), 'info');
        } else {
          logCollabWarning('[collab]', msg.code, msg.message);
        }
        break;
    }
  }, [acquireLock]);

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
    const setStatus = useEditorStore.getState().setCollabStatus;

    function scheduleReconnect() {
      if (disposed || stopReconnectRef.current) return;
      if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
        logCollabWarning('[collab] Max reconnect attempts reached, giving up');
        setStatus('offline');
        return;
      }
      setStatus(wasConnected ? 'reconnecting' : 'connecting');
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s...
      const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attemptCount), RECONNECT_MAX_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    async function connect() {
      if (!pageId || pageId.startsWith('page_')) return;
      if (disposed || stopReconnectRef.current) return;
      setStatus(wasConnected ? 'reconnecting' : 'connecting');

      // A fresh single-use ticket per attempt: the socket may be on another
      // domain where the session cookie is not sent (ADR-010)
      let ticket: string;
      try {
        ({ ticket } = await api.auth.wsTicket());
      } catch (e) {
        logCollabWarning('[collab] Could not get a WebSocket ticket', e);
        attemptCount++;
        scheduleReconnect();
        return;
      }
      if (disposed) return;

      const url = `${WS_BASE}/ws/pages/${pageId}/?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
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
        useEditorStore.getState().clearCollaboration();

        const status = useEditorStore.getState().collabStatus;
        if (stopReconnectRef.current) return; // revoked / plan limit: status already set

        // Server explicitly rejected (auth failure, no access, infra error) — don't retry
        if (FINAL_CLOSE_CODES.has(event.code)) {
          logCollabWarning(`[collab] Connection rejected (code ${event.code}), not retrying`);
          // 4003 without a message: access to the page is gone
          setStatus(event.code === 4003 && status !== 'unavailable' ? 'revoked' : 'offline');
          return;
        }

        // If we never successfully connected, likely server is down — use backoff
        if (!wasConnected) attemptCount++;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after this, so just let it handle reconnection
      };
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

    connect();

    return () => {
      disposed = true;
      mountedRef.current = false;
      cleanup();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      heldLocksRef.current.clear();
      // Clean collaboration state
      useEditorStore.getState().clearCollaboration();
      useEditorStore.getState().setCollabStatus('idle');
    };
  }, [pageId, handleMessage]);

  return { acquireLock, releaseLock, sendBlockUpdate, sendCursorMove };
}

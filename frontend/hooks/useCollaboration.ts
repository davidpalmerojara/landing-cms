'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { getAccessToken } from '@/lib/api';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001';
const LOCK_RENEW_INTERVAL = 10_000; // 10s
const PING_INTERVAL = 25_000; // 25s
const RECONNECT_BASE_DELAY = 2_000; // 2s initial
const RECONNECT_MAX_DELAY = 60_000; // 60s max
const MAX_RECONNECT_ATTEMPTS = 8;
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

export function useCollaboration(pageId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldLocksRef = useRef<Set<string>>(new Set());
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
    send({ type: 'lock_release', block_id: blockId });
    heldLocksRef.current.delete(blockId);
    // Optimistically clear from store so outline disappears immediately
    useEditorStore.getState().setBlockLock(blockId, null);
  }, [send]);

  const sendBlockUpdate = useCallback((blockId: string, data?: Record<string, unknown>, styles?: Record<string, unknown>) => {
    send({ type: 'block_updated', block_id: blockId, data, styles });
  }, [send]);

  const sendCursorMove = useCallback((x: number, y: number) => {
    send({ type: 'cursor_move', x, y });
  }, [send]);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: CollabMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const store = useEditorStore.getState();

    switch (msg.type) {
      case 'connected':
        if (msg.user && (msg.user as { id: string }).id) {
          store.setMyUserId((msg.user as { id: string }).id);
        }
        store.setConnectedUsers((msg.users as Array<{ id: string; username: string; email: string; avatar: string }>) || []);
        store.setBlockLocks((msg.locks as Record<string, string>) || {});
        break;

      case 'user_joined':
        store.setConnectedUsers((msg.users as Array<{ id: string; username: string; email: string; avatar: string }>) || []);
        break;

      case 'user_left':
        store.setConnectedUsers((msg.users as Array<{ id: string; username: string; email: string; avatar: string }>) || []);
        if (msg.user && (msg.user as { id: string }).id) {
          store.removeCursorPosition((msg.user as { id: string }).id);
        }
        break;

      case 'lock_acquired': {
        const blockId = msg.block_id as string;
        const userId = msg.user_id as string;
        store.setBlockLock(blockId, userId);
        // Track our own locks for renewal
        const token = getAccessToken();
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.user_id === userId) {
              heldLocksRef.current.add(blockId);
            }
          } catch { /* ignore */ }
        }
        break;
      }

      case 'lock_released': {
        const blockId = msg.block_id as string;
        store.setBlockLock(blockId, null);
        heldLocksRef.current.delete(blockId);
        break;
      }

      case 'lock_rejected':
        // Could show a toast here in the future
        break;

      case 'block_updated':
        store.applyRemoteBlockUpdate(
          msg.block_id as string,
          msg.data as Record<string, unknown> | undefined,
          msg.styles as Record<string, unknown> | undefined,
        );
        break;

      case 'cursor_moved':
        store.setCursorPosition(
          msg.user_id as string,
          msg.x as number,
          msg.y as number,
        );
        break;

      case 'pong':
        break;

      case 'error':
        logCollabWarning('[collab]', msg.message);
        break;
    }
  }, []);

  // Auto-acquire/release locks when selectedBlockId changes
  useEffect(() => {
    const prevBlockRef = { current: null as string | null };

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
        prevBlockRef.current = selectedBlockId;
      },
    );

    return () => unsub();
  }, [acquireLock, releaseLock]);

  // Broadcast block changes via WebSocket when user edits
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
          const dataChanged = block.data !== prevBlock.data;
          const stylesChanged = block.styles !== prevBlock.styles;
          if (dataChanged || stylesChanged) {
            sendBlockUpdate(
              block.id,
              dataChanged ? (block.data as unknown as Record<string, unknown>) : undefined,
              stylesChanged ? (block.styles as unknown as Record<string, unknown>) : undefined,
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
    let attemptCount = 0;
    let wasConnected = false;

    function connect() {
      const token = getAccessToken();
      if (!token || !pageId || pageId.startsWith('page_')) return;

      if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
        logCollabWarning(
          `[collab] Stopped reconnecting after ${MAX_RECONNECT_ATTEMPTS} failed attempts`,
        );
        return;
      }

      const url = `${WS_BASE}/ws/pages/${pageId}/?token=${token}`;
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

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        cleanup();

        if (!mountedRef.current) return;

        // Server explicitly rejected (auth failure, no access, infra error) — don't retry
        if (event.code === 4001 || event.code === 4003 || event.code === 4500) {
          logCollabWarning(`[collab] Connection rejected (code ${event.code}), not retrying`);
          return;
        }

        // If we never successfully connected, likely server is down — use backoff
        if (!wasConnected) {
          attemptCount++;
        }

        if (attemptCount >= MAX_RECONNECT_ATTEMPTS) {
          logCollabWarning('[collab] Max reconnect attempts reached, giving up');
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s...
        const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attemptCount), RECONNECT_MAX_DELAY);
        reconnectTimerRef.current = setTimeout(connect, delay);
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
      useEditorStore.getState().setConnectedUsers([]);
      useEditorStore.getState().setBlockLocks({});
      useEditorStore.setState({ cursorPositions: {} });
    };
  }, [pageId, handleMessage]);

  return { acquireLock, releaseLock, sendBlockUpdate, sendCursorMove };
}

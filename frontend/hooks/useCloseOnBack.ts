'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The phone's back button (or gesture) closes the open sheet instead of
 * leaving the editor (QA-066). Opening the first sheet adds one history entry
 * at the same URL; going back from it closes the top sheet. Closing the last
 * sheet any other way removes that entry again, so the history is left as it
 * was. One entry is shared by every sheet: replacing a sheet with another
 * (the block picker opening the new block's sheet) keeps it. A dialog opened
 * from a sheet (the media library) registers too, so back closes it first.
 */

interface OpenSheet {
  close: () => void;
}

const HISTORY_MARKER = 'paxlSheet';
/** Time for another sheet to replace the one that just closed before the entry is removed */
const RELEASE_DELAY_MS = 120;

const openSheets: OpenSheet[] = [];
let ownsHistoryEntry = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const openChangeListeners = new Set<() => void>();

function notifyOpenChange() {
  openChangeListeners.forEach((listener) => listener());
}

function isOnOurEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && HISTORY_MARKER in state;
}

function onPopState() {
  if (!ownsHistoryEntry || isOnOurEntry()) return;
  // The user went back from our entry: close the top sheet, stay on the page
  ownsHistoryEntry = false;
  openSheets[openSheets.length - 1]?.close();
}

function pushEntry() {
  window.history.pushState({ [HISTORY_MARKER]: true }, '');
  ownsHistoryEntry = true;
}

function register(sheet: OpenSheet) {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
    window.removeEventListener('beforeunload', cancelRelease);
  }
  if (openSheets.length === 0) window.addEventListener('popstate', onPopState);
  openSheets.push(sheet);
  if (!ownsHistoryEntry) pushEntry();
  notifyOpenChange();
}

function unregister(sheet: OpenSheet) {
  const index = openSheets.indexOf(sheet);
  if (index !== -1) openSheets.splice(index, 1);
  notifyOpenChange();
  if (openSheets.length > 0) {
    // Back closed the top sheet and another is still open: it needs its own entry
    if (!ownsHistoryEntry) pushEntry();
    return;
  }
  window.removeEventListener('popstate', onPopState);
  if (!ownsHistoryEntry) return;
  window.addEventListener('beforeunload', cancelRelease);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    window.removeEventListener('beforeunload', cancelRelease);
    if (openSheets.length > 0 || !ownsHistoryEntry) return;
    ownsHistoryEntry = false;
    // Only while still on our entry: never go back from a page navigated to since
    if (isOnOurEntry()) window.history.back();
  }, RELEASE_DELAY_MS);
}

/** The page is being left: going back now would cancel that navigation. */
function cancelRelease() {
  window.removeEventListener('beforeunload', cancelRelease);
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  ownsHistoryEntry = false;
}

/**
 * Registers an open sheet (or a dialog opened from one). Returns `isTop`:
 * whether it is the last one opened, so Escape closes only that one.
 */
export function useCloseOnBack(open: boolean, onClose: () => void): () => boolean {
  const onCloseRef = useRef(onClose);
  const sheetRef = useRef<OpenSheet | null>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const sheet: OpenSheet = { close: () => onCloseRef.current() };
    sheetRef.current = sheet;
    register(sheet);
    return () => {
      sheetRef.current = null;
      unregister(sheet);
    };
  }, [open]);

  return useCallback(() => sheetRef.current !== null && openSheets[openSheets.length - 1] === sheetRef.current, []);
}

function subscribeToOpenChange(listener: () => void): () => void {
  openChangeListeners.add(listener);
  return () => openChangeListeners.delete(listener);
}

const anySheetOpen = () => openSheets.length > 0;
const neverOpenOnServer = () => false;

/**
 * Whether a sheet or dialog that closes with the back button is open (the
 * block sheets, the media library, the preview, confirmations). Toasts use it
 * to stay clear of whatever the person is working on (MOBILE2-004).
 */
export function useIsAnySheetOpen(): boolean {
  return useSyncExternalStore(subscribeToOpenChange, anySheetOpen, neverOpenOnServer);
}

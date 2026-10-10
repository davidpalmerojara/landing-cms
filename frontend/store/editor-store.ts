import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Page, SeoFields } from '@/types/page';
import { defaultSeoFields } from '@/types/page';
import type { ColorTokens, TypographyTokens, SpacingTokens, BorderTokens } from '@/lib/design-tokens';
import type { Block, BlockStyles, BlockType, DataPath } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';
import type { ToastData } from '@/components/ui/Toast';
import type { SaveIssue } from '@/lib/page-sync';
import type { DeviceMode, ViewportState, InteractionState, DragSource } from '@/types/editor';
import { newBlockId } from '@/lib/block-factory';
import { getDefaultPage } from '@/lib/default-page';
import {
  getAtPath,
  insertListItem,
  isBlockType,
  isPlainObject,
  listMaxItems,
  makeBlock,
  moveListItem,
  pathKey,
  removeListItem,
  setAtPath,
  splitApiStyles,
  withBlockData,
} from '@/lib/block-data';
import {
  applyRelayedEdits,
  combineRelayedEdits,
  relayedChanges,
  withoutRelayedEdits,
} from '@/lib/page-merge';
import type { RelayedEdits } from '@/lib/page-merge';

/**
 * The block as its lock holder has it: relayed data (normalized for the type)
 * and styles in the API shape. Either may be missing from a relay.
 */
function relayedBlock(current: Block, data: unknown, styles: unknown): Block {
  const withData = isPlainObject(data) ? withBlockData(current, data) : current;
  if (!isPlainObject(styles)) return withData;
  const { styles: base, responsiveStyles } = splitApiStyles(styles);
  // Rebuilt from its parts so per-device styles absent from the relay are dropped
  return makeBlock({ id: withData.id, name: withData.name, styles: base, responsiveStyles }, withData.type, withData.data);
}

/** Blocks with block `id` replaced by `update(block)`. */
function mapBlock(blocks: Block[], id: string, update: (block: Block) => Block): Block[] {
  return blocks.map((block) => (block.id === id ? update(block) : block));
}

// --- Types ---

type LeftTab = 'components' | 'layers';

interface InspectorSections {
  content: boolean;
  styles: boolean;
}

/** One open collaboration socket (a user with two tabs has two). */
export interface PresenceEntry {
  connectionId: string;
  userId: string;
  username: string;
}

/**
 * State of the collaboration socket. `offline`: gave up reconnecting;
 * `revoked`: access removed while editing; `unavailable`: the owner's plan has
 * no real-time collaboration (saving still works).
 */
export type CollabStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'revoked' | 'unavailable';

/** The page as the server last had it, and its version: the base of the three-way merge. */
export interface SyncBase {
  page: Page;
  version: number;
}

export interface CursorPosition {
  x: number; // 0-1 relative to canvas width
  y: number; // 0-1 relative to canvas height
  connectionId: string;
  userId: string;
  username: string;
  color: string;
  timestamp: number;
}

// Stable color palette for collaboration — deterministic by user ID
export const COLLAB_COLORS = [
  { hex: '#6366f1', bg: 'bg-[#2563EB]', outline: 'outline-[#2563EB]', hoverBg: 'hover:bg-indigo-700' },
  { hex: '#f59e0b', bg: 'bg-amber-500', outline: 'outline-amber-500', hoverBg: 'hover:bg-amber-700' },
  { hex: '#10b981', bg: 'bg-emerald-500', outline: 'outline-emerald-500', hoverBg: 'hover:bg-emerald-700' },
  { hex: '#ef4444', bg: 'bg-red-500', outline: 'outline-red-500', hoverBg: 'hover:bg-red-700' },
  { hex: '#8b5cf6', bg: 'bg-violet-500', outline: 'outline-violet-500', hoverBg: 'hover:bg-violet-700' },
  { hex: '#ec4899', bg: 'bg-pink-500', outline: 'outline-pink-500', hoverBg: 'hover:bg-pink-700' },
  { hex: '#06b6d4', bg: 'bg-cyan-500', outline: 'outline-cyan-500', hoverBg: 'hover:bg-cyan-700' },
  { hex: '#f97316', bg: 'bg-orange-500', outline: 'outline-orange-500', hoverBg: 'hover:bg-orange-700' },
];

export function getUserColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

/** Sockets on the page other than this tab's (another person, or this person in another tab). */
export function countOtherConnections({ presence, myConnectionId }: { presence: PresenceEntry[]; myConnectionId: string | null }): number {
  return presence.filter((entry) => entry.connectionId !== myConnectionId).length;
}

/**
 * Holder of block `id`'s lock when it is another connection (another person,
 * or this person in another tab), else null.
 */
export function lockHeldByOther(
  { blockLocks, myConnectionId }: { blockLocks: Record<string, PresenceEntry>; myConnectionId: string | null },
  id: string,
): PresenceEntry | null {
  const holder = blockLocks[id];
  return holder && holder.connectionId !== myConnectionId ? holder : null;
}

/** A selection or delete refused because another connection holds the block. */
export interface LockRefusal {
  blockId: string;
  holder: PresenceEntry;
  /** Grows with each refusal, so refusing the same block twice is two changes */
  seq: number;
}

/** Why the editor lost access while open: the owner stopped sharing it, or deleted the page. */
export type RevokedReason = 'unshared' | 'deleted';

/** One entry per person (first connection wins): avatars show people, not tabs. */
export function uniquePresenceUsers(presence: PresenceEntry[]): PresenceEntry[] {
  const seen = new Set<string>();
  return presence.filter((entry) => {
    if (seen.has(entry.userId)) return false;
    seen.add(entry.userId);
    return true;
  });
}

interface EditorState {
  // Document
  page: Page;
  past: Page[];
  future: Page[];
  /** Consecutive edits with the same key within HISTORY_COALESCE_MS share one undo step. */
  historyCoalesceKey: string | null;
  historyCoalesceAt: number;

  // Selection & clipboard
  selectedBlockId: string | null;
  clipboard: Block | null;

  // UI modes
  isPreviewMode: boolean;
  isQuickEditMode: boolean;
  deviceMode: DeviceMode;
  leftTab: LeftTab;
  inspectorSections: InspectorSections;
  isSaved: boolean;

  // Viewport
  viewportState: ViewportState;
  interactionState: InteractionState;

  // Auto-save
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** Why the last save did not get everything to the server; set by lib/page-sync */
  saveIssue: SaveIssue | null;

  // Collaboration
  myUserId: string | null;
  /** This tab's socket, sent as X-Connection-Id so the server can skip our own echo */
  myConnectionId: string | null;
  collabStatus: CollabStatus;
  /** Every open socket on the page, ours included */
  presence: PresenceEntry[];
  blockLocks: Record<string, PresenceEntry>; // blockId → holding connection
  cursorPositions: Record<string, CursorPosition>; // connectionId → cursor
  isRemoteUpdate: boolean;
  syncBase: SyncBase | null;
  /** Fields relayed live by lock holders and not yet confirmed by a save (QA-033) */
  relayedEdits: RelayedEdits;
  /** Last refused selection/delete of a block someone else holds; useCollaboration tells the user */
  lockRefusal: LockRefusal | null;
  /** Set together with collabStatus 'revoked' */
  revokedReason: RevokedReason | null;
  /** Grows each time the user asks to reconnect the collaboration socket now */
  collabReconnectRequest: number;

  // Toasts
  toasts: ToastData[];

  // Delete confirmation
  pendingDeleteBlockId: string | null;

  // Drag & drop (pointer-event based)
  dragPending: { source: DragSource; origin: { x: number; y: number } } | null;
  isDragging: boolean;
  dragSource: DragSource | null;
  dragPosition: { x: number; y: number };
  canvasDropIndex: number | null;
  layerDropIndex: number | null;
}

interface EditorActions {
  // Page mutations (with history)
  setPageWithHistory: (updater: Page | ((prev: Page) => Page), options?: { coalesceKey?: string }) => void;
  /** Replace the document with a freshly loaded page: clears history and selection. */
  loadPage: (page: Page) => void;
  /** Data is normalized for the type; without `initialData` nothing is added. */
  addBlock: (type: BlockType, label: string, index?: number | null, initialData?: unknown) => void;
  /** Set a top-level data field. Same as updateBlockField(id, [key], value). */
  updateBlock: (id: string, key: string, value: unknown) => void;
  /**
   * Set the value at `path` inside a block's data (['features', 2, 'title']).
   * Only existing slots are written; consecutive edits of one path share an undo step.
   */
  updateBlockField: (id: string, path: DataPath, value: unknown) => void;
  /** Insert an item in list `listKey` (at the end by default). Its own undo step; no-op at the list's maximum. */
  addListItem: (id: string, listKey: string, item: unknown, index?: number) => void;
  /** Remove item `index` of list `listKey`. Its own undo step. */
  removeListItem: (id: string, listKey: string, index: number) => void;
  /** Move item `from` of list `listKey` to position `to`. Its own undo step. */
  moveListItem: (id: string, listKey: string, from: number, to: number) => void;
  updateBlockStyle: (id: string, styleKey: keyof BlockStyles, value: unknown) => void;
  updateBlockResponsiveStyle: (id: string, device: 'tablet' | 'mobile', styleKey: keyof BlockStyles, value: unknown) => void;
  deleteBlock: (id: string) => void;
  /**
   * Ask to confirm deleting a block. Returns false, asking nothing, when
   * another connection holds the block (QA-011) or editing is not allowed.
   */
  requestDeleteBlock: (id: string) => boolean;
  cancelDeleteBlock: () => void;
  confirmDeleteBlock: () => void;
  duplicateBlock: (id: string) => void;
  /**
   * Select a block (null clears the selection). Returns whether the selection
   * is now `id`: false while panning or previewing, after access was revoked,
   * and when another connection holds the block's lock (QA-011: refused on
   * every path, with `lockRefusal` set so the user is told). Callers that open
   * an editing UI must check it.
   */
  selectBlock: (id: string | null) => boolean;

  // Quick Edit Mode
  setIsQuickEditMode: (value: boolean) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  moveBlockUp: (id: string) => void;
  moveBlockDown: (id: string) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Clipboard
  copy: () => void;
  paste: () => void;

  // UI
  setDeviceMode: (mode: DeviceMode) => void;
  togglePreview: () => void;
  setLeftTab: (tab: LeftTab) => void;
  toggleInspectorSection: (section: keyof InspectorSections) => void;
  updateDesignTokenColor: (key: keyof ColorTokens, value: string) => void;
  updateDesignTokenTypography: (key: keyof TypographyTokens, value: string | number) => void;
  updateDesignTokenSpacing: (key: keyof SpacingTokens, value: string) => void;
  updateDesignTokenBorders: (key: keyof BorderTokens, value: string) => void;
  setDesignTokenColors: (colors: ColorTokens) => void;
  updateSeo: (key: keyof SeoFields, value: string | boolean) => void;
  save: () => void;

  // Viewport
  setViewportState: (updater: ViewportState | ((prev: ViewportState) => ViewportState)) => void;
  setInteractionState: (updater: InteractionState | ((prev: InteractionState) => InteractionState)) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Collaboration
  setMyUserId: (id: string) => void;
  setCollabStatus: (status: CollabStatus) => void;
  /**
   * Access to the page is gone while editing (unshared or page deleted): the
   * editor becomes read-only (QA-110), the selection is cleared.
   */
  setAccessRevoked: (reason: RevokedReason) => void;
  /** Ask useCollaboration to reconnect now (the "Reconectar" button). */
  requestCollabReconnect: () => void;
  /** Start of a session: own connection and everyone present. */
  setPresence: (connectionId: string | null, entries: PresenceEntry[]) => void;
  addPresence: (entry: PresenceEntry) => void;
  /** A socket left: its cursor goes too. */
  removePresence: (connectionId: string) => void;
  /** Forget everything about the session (socket closed or editor left). */
  clearCollaboration: () => void;
  setBlockLocks: (locks: Record<string, PresenceEntry>) => void;
  setBlockLock: (blockId: string, holder: PresenceEntry | null) => void;
  setCursorPosition: (connectionId: string, x: number, y: number) => void;
  removeCursorPosition: (connectionId: string) => void;
  setSyncBase: (base: SyncBase | null) => void;
  /**
   * Replace the page with one merged from the server: no undo step, no
   * autosave. `rebase` brings each undo/redo snapshot up to date so undoing a
   * local edit does not revert someone else's. The selection is kept while
   * its block still exists. Relayed live text of blocks whose holder still
   * has them stays on screen; relays of released blocks are dropped.
   */
  applyRemotePage: (page: Page, rebase?: (snapshot: Page) => Page) => void;
  /** Replace a block's type and data (AI edit). Returns false, changing nothing, for an unknown type. */
  replaceBlockData: (blockId: string, newType: string, newData: unknown) => boolean;
  /**
   * Live edit relayed from the block's lock holder (`connectionId`): its data
   * (normalized) and styles (API shape) are the holder's whole block. Only the
   * fields that differ from what is on screen are written, in the page and in
   * the undo snapshots, so undo neither brings back the old text nor loses
   * this person's own steps on other fields (QA-032). They are recorded in
   * `relayedEdits`, not in the sync base: until the holder saves, they are
   * not this editor's to save (QA-033).
   */
  applyRemoteBlockUpdate: (blockId: string, data?: unknown, styles?: unknown, connectionId?: string) => void;

  // Toasts
  /** Shows a toast and returns its id (to take it down again with `removeToast`) */
  addToast: (message: string, variant?: 'success' | 'error' | 'info') => string;
  removeToast: (id: string) => void;

  // Drag & drop (pointer-event based)
  initDrag: (source: DragSource, origin: { x: number; y: number }) => void;
  activateDrag: (position: { x: number; y: number }) => void;
  updateDragPosition: (position: { x: number; y: number }) => void;
  setCanvasDropIndex: (index: number | null) => void;
  setLayerDropIndex: (index: number | null) => void;
  performDrop: () => void;
  cancelDrag: () => void;
}

export type EditorStore = EditorState & EditorActions;

const HISTORY_LIMIT = 50;
export const HISTORY_COALESCE_MS = 1000;

/** Access to the page was revoked (unshared or deleted): the editor only shows it. */
function isReadOnly(state: EditorState): boolean {
  return state.collabStatus === 'revoked';
}

/**
 * Whether this editor may change block `id` now: never one another connection
 * holds. The UI refuses to select such a block; this also covers a field or
 * shortcut that still points at it (QA-011).
 */
function canEditBlock(state: EditorState, id: string): boolean {
  return !isReadOnly(state) && lockHeldByOther(state, id) === null;
}

export const useEditorStore = create<EditorStore>()(subscribeWithSelector((set, get) => {
  /** True, recording the refusal for useCollaboration to announce, when another connection holds block `id`. */
  const refuseLockedBlock = (id: string): boolean => {
    const holder = lockHeldByOther(get(), id);
    if (!holder) return false;
    set((state) => ({ lockRefusal: { blockId: id, holder, seq: (state.lockRefusal?.seq ?? 0) + 1 } }));
    return true;
  };

  /** Clear `isRemoteUpdate` once the subscribers (autosave, relay) have seen the change it flags. */
  const endRemoteUpdateSoon = () => {
    queueMicrotask(() => set({ isRemoteUpdate: false }));
  };

  return ({
  // --- Initial state ---
  // The editor loads the real page before showing it; Spanish only fills the gap until then
  page: getDefaultPage('es'),
  past: [],
  future: [],
  historyCoalesceKey: null,
  historyCoalesceAt: 0,
  selectedBlockId: null,
  clipboard: null,
  isPreviewMode: false,
  isQuickEditMode: false,
  deviceMode: 'desktop',
  leftTab: 'components',
  inspectorSections: { content: true, styles: true },
  isSaved: false,
  autoSaveStatus: 'idle',
  saveIssue: null,
  myUserId: null,
  myConnectionId: null,
  collabStatus: 'idle',
  presence: [],
  blockLocks: {},
  cursorPositions: {},
  isRemoteUpdate: false,
  syncBase: null,
  relayedEdits: {},
  lockRefusal: null,
  revokedReason: null,
  collabReconnectRequest: 0,
  viewportState: { zoom: 1, x: 0, y: 0 },
  interactionState: { isPanning: false, isSpacePressed: false, isMiddleClickPanning: false },
  toasts: [],
  pendingDeleteBlockId: null,
  dragPending: null,
  isDragging: false,
  dragSource: null,
  dragPosition: { x: 0, y: 0 },
  canvasDropIndex: null,
  layerDropIndex: null,

  // --- Page mutations with history ---
  setPageWithHistory: (updater, options) => {
    const { page, historyCoalesceKey, historyCoalesceAt } = get();
    // Read-only once access is gone: nothing typed now could be saved (QA-110)
    if (isReadOnly(get())) return;
    const newPage = typeof updater === 'function' ? updater(page) : updater;
    if (newPage === page) return;

    const now = Date.now();
    const coalesceKey = options?.coalesceKey ?? null;
    const coalesce =
      coalesceKey !== null &&
      coalesceKey === historyCoalesceKey &&
      now - historyCoalesceAt < HISTORY_COALESCE_MS;

    set((state) => ({
      page: newPage,
      // Typing in a field keeps extending the same undo step
      past: coalesce ? state.past : [...state.past, page].slice(-HISTORY_LIMIT),
      future: [],
      isSaved: false,
      historyCoalesceKey: coalesceKey,
      historyCoalesceAt: now,
    }));
  },

  loadPage: (page) => {
    // Flagged as remote so autosave doesn't send back what was just loaded
    set({
      page,
      past: [],
      future: [],
      selectedBlockId: null,
      relayedEdits: {},
      isSaved: true,
      isRemoteUpdate: true,
      historyCoalesceKey: null,
      historyCoalesceAt: 0,
    });
    queueMicrotask(() => set({ isRemoteUpdate: false }));
  },

  addBlock: (type, label, index = null, initialData) => {
    if (!initialData) return;
    const newId = newBlockId();
    const newBlock = makeBlock({ id: newId, name: label, styles: { ...defaultBlockStyles } }, type, initialData);
    get().setPageWithHistory((prev) => {
      const newBlocks = [...prev.blocks];
      if (index !== null) newBlocks.splice(index, 0, newBlock);
      else newBlocks.push(newBlock);
      return { ...prev, blocks: newBlocks };
    });
    set({ selectedBlockId: newId });
  },

  updateBlock: (id, key, value) => {
    get().updateBlockField(id, [key], value);
  },

  updateBlockField: (id, path, value) => {
    const block = get().page.blocks.find((b) => b.id === id);
    if (!block || !canEditBlock(get(), id)) return;
    const nextData = setAtPath(block.data, path, value);
    if (nextData === block.data) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: mapBlock(prev.blocks, id, (b) => withBlockData(b, nextData)),
    }), { coalesceKey: `block:${id}:data:${pathKey(path)}` });
  },

  // Structural list changes: no coalesceKey, so each one is its own undo step
  // and the typing that follows starts a new one.
  addListItem: (id, listKey, item, index) => {
    const block = get().page.blocks.find((b) => b.id === id);
    if (!block || !canEditBlock(get(), id)) return;
    const items = getAtPath(block.data, [listKey]);
    if (!Array.isArray(items) || items.length >= listMaxItems(block.type, listKey)) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: mapBlock(prev.blocks, id, (b) => withBlockData(b, insertListItem(b.data, listKey, item, index))),
    }));
  },

  removeListItem: (id, listKey, index) => {
    if (!canEditBlock(get(), id)) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: mapBlock(prev.blocks, id, (b) => withBlockData(b, removeListItem(b.data, listKey, index))),
    }));
  },

  moveListItem: (id, listKey, from, to) => {
    if (!canEditBlock(get(), id)) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: mapBlock(prev.blocks, id, (b) => withBlockData(b, moveListItem(b.data, listKey, from, to))),
    }));
  },

  updateBlockStyle: (id, styleKey, value) => {
    if (!canEditBlock(get(), id)) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === id
          ? { ...block, styles: { ...(block.styles || defaultBlockStyles), [styleKey]: value } }
          : block
      ),
    }), { coalesceKey: `block:${id}:style:${String(styleKey)}` });
  },

  updateBlockResponsiveStyle: (id, device, styleKey, value) => {
    if (!canEditBlock(get(), id)) return;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => {
        if (block.id !== id) return block;
        const current = block.responsiveStyles || {};
        const deviceStyles = current[device] || {};
        // If value matches base style, remove the override
        const baseValue = (block.styles || defaultBlockStyles)[styleKey];
        if (value === baseValue) {
          const { [styleKey]: _, ...rest } = deviceStyles;
          const newResponsive = { ...current, [device]: Object.keys(rest).length > 0 ? rest : undefined };
          return { ...block, responsiveStyles: newResponsive };
        }
        return {
          ...block,
          responsiveStyles: {
            ...current,
            [device]: { ...deviceStyles, [styleKey]: value },
          },
        };
      }),
    }), { coalesceKey: `block:${id}:${device}:${String(styleKey)}` });
  },

  deleteBlock: (id) => {
    const { selectedBlockId } = get();
    if (!canEditBlock(get(), id)) return;
    get().setPageWithHistory((prev) => {
      const removedIndex = prev.blocks.findIndex((b) => b.id === id);
      if (removedIndex === -1) return prev;
      const remainingBlocks = prev.blocks.filter((b) => b.id !== id);

      if (selectedBlockId === id) {
        const nextSelected =
          remainingBlocks.length > 0
            ? (remainingBlocks[removedIndex] || remainingBlocks[removedIndex - 1]).id
            : null;
        setTimeout(() => set({ selectedBlockId: nextSelected }), 0);
      }
      return { ...prev, blocks: remainingBlocks };
    });
  },

  requestDeleteBlock: (id) => {
    if (refuseLockedBlock(id)) return false;
    if (isReadOnly(get())) return false;
    set({ pendingDeleteBlockId: id });
    return true;
  },
  cancelDeleteBlock: () => set({ pendingDeleteBlockId: null }),
  confirmDeleteBlock: () => {
    const { pendingDeleteBlockId } = get();
    if (!pendingDeleteBlockId) return;
    set({ pendingDeleteBlockId: null });
    // Someone may have taken the block while the dialog was open
    if (refuseLockedBlock(pendingDeleteBlockId)) return;
    get().deleteBlock(pendingDeleteBlockId);
  },

  duplicateBlock: (id) => {
    const newId = newBlockId();
    get().setPageWithHistory((prev) => {
      const index = prev.blocks.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const newBlock: Block = JSON.parse(JSON.stringify(prev.blocks[index]));
      newBlock.id = newId;
      const newBlocks = [...prev.blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      return { ...prev, blocks: newBlocks };
    });
    set({ selectedBlockId: newId });
  },

  selectBlock: (id) => {
    const state = get();
    const { isPreviewMode, interactionState } = state;
    if (isPreviewMode || interactionState.isSpacePressed || interactionState.isMiddleClickPanning) {
      return state.selectedBlockId === id;
    }
    if (id !== null) {
      if (refuseLockedBlock(id)) return false;
      if (isReadOnly(state)) return false;
    }
    set({ selectedBlockId: id });
    return true;
  },

  // --- Quick Edit Mode ---
  setIsQuickEditMode: (value) => set({ isQuickEditMode: value }),

  reorderBlocks: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    get().setPageWithHistory((prev) => {
      const newBlocks = [...prev.blocks];
      const [moved] = newBlocks.splice(fromIndex, 1);
      const finalIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      newBlocks.splice(finalIndex, 0, moved);
      return { ...prev, blocks: newBlocks };
    });
  },

  moveBlockUp: (id) => {
    const { page } = get();
    const index = page.blocks.findIndex((b) => b.id === id);
    if (index <= 0) return;
    get().reorderBlocks(index, index - 1);
  },

  moveBlockDown: (id) => {
    const { page } = get();
    const index = page.blocks.findIndex((b) => b.id === id);
    if (index === -1 || index >= page.blocks.length - 1) return;
    get().reorderBlocks(index, index + 2);
  },

  // --- History ---
  undo: () => {
    const { past, page } = get();
    if (past.length === 0 || isReadOnly(get())) return;
    const prevState = past[past.length - 1];
    set((state) => ({
      page: prevState,
      past: state.past.slice(0, -1),
      future: [page, ...state.future].slice(0, HISTORY_LIMIT),
      historyCoalesceKey: null,
    }));
  },

  redo: () => {
    const { future, page } = get();
    if (future.length === 0 || isReadOnly(get())) return;
    const nextState = future[0];
    set((state) => ({
      page: nextState,
      past: [...state.past, page].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      historyCoalesceKey: null,
    }));
  },

  // --- Clipboard ---
  copy: () => {
    const { page, selectedBlockId } = get();
    if (!selectedBlockId) return;
    const block = page.blocks.find((b) => b.id === selectedBlockId);
    if (block) set({ clipboard: JSON.parse(JSON.stringify(block)) });
  },

  paste: () => {
    const { clipboard, selectedBlockId, page } = get();
    if (!clipboard) return;
    const newId = newBlockId();
    const newBlock: Block = { ...JSON.parse(JSON.stringify(clipboard)), id: newId };

    get().setPageWithHistory((prev) => {
      const newBlocks = [...prev.blocks];
      if (selectedBlockId) {
        const index = newBlocks.findIndex((b) => b.id === selectedBlockId);
        if (index !== -1) newBlocks.splice(index + 1, 0, newBlock);
        else newBlocks.push(newBlock);
      } else {
        newBlocks.push(newBlock);
      }
      return { ...prev, blocks: newBlocks };
    });
    set({ selectedBlockId: newId });
  },

  // --- UI ---
  setDeviceMode: (mode) => set({ deviceMode: mode }),
  togglePreview: () => set((state) => ({ isPreviewMode: !state.isPreviewMode })),
  setLeftTab: (tab) => set({ leftTab: tab }),
  toggleInspectorSection: (section) =>
    set((state) => ({
      inspectorSections: {
        ...state.inspectorSections,
        [section]: !state.inspectorSections[section],
      },
    })),
  updateDesignTokenColor: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens;
      return {
        ...prev,
        designTokens: {
          ...tokens,
          colors: {
            ...tokens.colors,
            [key]: value,
          },
        },
      };
    }, { coalesceKey: `tokens:colors:${String(key)}` });
  },
  updateDesignTokenTypography: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens;
      return {
        ...prev,
        designTokens: {
          ...tokens,
          typography: {
            ...tokens.typography,
            [key]: value,
          },
        },
      };
    }, { coalesceKey: `tokens:typography:${String(key)}` });
  },
  updateDesignTokenSpacing: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens;
      return {
        ...prev,
        designTokens: {
          ...tokens,
          spacing: {
            ...tokens.spacing,
            [key]: value,
          },
        },
      };
    }, { coalesceKey: `tokens:spacing:${String(key)}` });
  },
  updateDesignTokenBorders: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens;
      return {
        ...prev,
        designTokens: {
          ...tokens,
          borders: {
            ...tokens.borders,
            [key]: value,
          },
        },
      };
    }, { coalesceKey: `tokens:borders:${String(key)}` });
  },
  setDesignTokenColors: (colors) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens;
      return { ...prev, designTokens: { ...tokens, colors } };
    });
  },
  updateSeo: (key, value) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      seo: { ...(prev.seo || defaultSeoFields), [key]: value },
    }), { coalesceKey: `seo:${key}` });
  },
  save: () => set({ isSaved: true }),

  // --- Viewport ---
  setViewportState: (updater) => {
    set((state) => {
      const newVS = typeof updater === 'function' ? updater(state.viewportState) : updater;
      return { viewportState: newVS };
    });
  },
  setInteractionState: (updater) => {
    set((state) => {
      const newIS = typeof updater === 'function' ? updater(state.interactionState) : updater;
      return { interactionState: newIS };
    });
  },
  zoomIn: () =>
    set((state) => ({
      viewportState: {
        ...state.viewportState,
        zoom: Math.min(Math.round((state.viewportState.zoom + 0.1) * 10) / 10, 2),
      },
    })),
  zoomOut: () =>
    set((state) => ({
      viewportState: {
        ...state.viewportState,
        zoom: Math.max(Math.round((state.viewportState.zoom - 0.1) * 10) / 10, 0.5),
      },
    })),

  // --- Collaboration ---
  setMyUserId: (id) => set({ myUserId: id }),
  setCollabStatus: (status) => set((state) => ({
    collabStatus: status,
    revokedReason: status === 'revoked' ? (state.revokedReason ?? 'unshared') : null,
    ...(status === 'revoked' ? { selectedBlockId: null, pendingDeleteBlockId: null } : {}),
  })),
  setAccessRevoked: (reason) => set({
    collabStatus: 'revoked',
    revokedReason: reason,
    selectedBlockId: null,
    pendingDeleteBlockId: null,
  }),
  requestCollabReconnect: () => set((state) => ({ collabReconnectRequest: state.collabReconnectRequest + 1 })),
  setPresence: (connectionId, entries) => {
    const own = entries.find((e) => e.connectionId === connectionId);
    set((state) => ({
      myConnectionId: connectionId,
      myUserId: own?.userId ?? state.myUserId,
      presence: entries,
    }));
  },
  addPresence: (entry) => {
    set((state) => ({
      presence: [...state.presence.filter((e) => e.connectionId !== entry.connectionId), entry],
    }));
  },
  removePresence: (connectionId) => {
    const { relayedEdits, syncBase } = get();
    // Text the leaving connection relayed and never saved goes with it (QA-033);
    // a save it made on the way out arrives as page_updated and is merged
    const leaving = Object.fromEntries(
      Object.entries(relayedEdits).filter(([, edit]) => edit.connectionId === connectionId),
    );
    const hasLeaving = Object.keys(leaving).length > 0;
    const revert = (page: Page): Page => (syncBase ? withoutRelayedEdits(page, syncBase.page, leaving) : page);

    set((state) => {
      const cursors = Object.fromEntries(
        Object.entries(state.cursorPositions).filter(([id]) => id !== connectionId),
      );
      const locks = Object.fromEntries(
        Object.entries(state.blockLocks).filter(([, holder]) => holder.connectionId !== connectionId),
      );
      const common = {
        presence: state.presence.filter((e) => e.connectionId !== connectionId),
        cursorPositions: cursors,
        blockLocks: locks,
      };
      if (!hasLeaving) return common;
      const page = revert(state.page);
      return {
        ...common,
        page,
        past: state.past.map(revert),
        future: state.future.map(revert),
        relayedEdits: Object.fromEntries(
          Object.entries(state.relayedEdits).filter(([, edit]) => edit.connectionId !== connectionId),
        ),
        isRemoteUpdate: page !== state.page || state.isRemoteUpdate,
      };
    });
    if (hasLeaving) endRemoteUpdateSoon();
  },
  clearCollaboration: () => {
    set({ myConnectionId: null, presence: [], blockLocks: {}, cursorPositions: {} });
  },
  setBlockLocks: (locks) => set({ blockLocks: locks }),
  setBlockLock: (blockId, holder) => {
    set((state) => {
      const newLocks = { ...state.blockLocks };
      if (holder) newLocks[blockId] = holder;
      else delete newLocks[blockId];
      return { blockLocks: newLocks };
    });
  },
  setCursorPosition: (connectionId, x, y) => {
    const entry = get().presence.find((e) => e.connectionId === connectionId);
    if (!entry) return;
    // Colored by user: two tabs of one person look alike
    const color = getUserColor(entry.userId);
    set((state) => ({
      cursorPositions: {
        ...state.cursorPositions,
        [connectionId]: {
          x, y, connectionId, userId: entry.userId, username: entry.username, color: color.hex, timestamp: Date.now(),
        },
      },
    }));
  },
  removeCursorPosition: (connectionId) => {
    set((state) => {
      const { [connectionId]: _, ...rest } = state.cursorPositions;
      return { cursorPositions: rest };
    });
  },
  setSyncBase: (base) => set({ syncBase: base }),
  applyRemotePage: (page, rebase) => {
    const { selectedBlockId, pendingDeleteBlockId, relayedEdits, blockLocks } = get();
    const exists = (id: string | null) => id !== null && page.blocks.some((b) => b.id === id);
    // The merged page carries the server's values. Live text of a block whose
    // holder is still on it is newer than any save: keep showing it. Relays of
    // a released block end here; the holder's save is already in `page`.
    const stillHeld: RelayedEdits = Object.fromEntries(
      Object.entries(relayedEdits).filter(([id, edit]) => blockLocks[id]?.connectionId === edit.connectionId),
    );
    const overlay = (p: Page) => applyRelayedEdits(p, stillHeld);
    set((state) => ({
      page: overlay(page),
      past: (rebase ? state.past.map(rebase) : state.past).map(overlay),
      future: (rebase ? state.future.map(rebase) : state.future).map(overlay),
      relayedEdits: stillHeld,
      selectedBlockId: exists(selectedBlockId) ? selectedBlockId : null,
      pendingDeleteBlockId: exists(pendingDeleteBlockId) ? pendingDeleteBlockId : null,
      // The next local edit starts its own undo step
      historyCoalesceKey: null,
      isRemoteUpdate: true,
    }));
    endRemoteUpdateSoon();
  },
  replaceBlockData: (blockId, newType, newData) => {
    if (!isBlockType(newType)) return false;
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: mapBlock(prev.blocks, blockId, (block) => makeBlock(block, newType, newData)),
    }));
    return true;
  },

  applyRemoteBlockUpdate: (blockId, data, styles, connectionId = '') => {
    const current = get().page.blocks.find((b) => b.id === blockId);
    if (!current) return;
    // Only what the holder changed compared with what is on screen
    const change = relayedChanges(current, relayedBlock(current, data, styles), connectionId);
    if (!change) return;
    const patch = (page: Page): Page => applyRelayedEdits(page, { [blockId]: change });
    set((state) => {
      const previous = state.relayedEdits[blockId];
      const edit = previous && previous.connectionId === connectionId ? combineRelayedEdits(previous, change) : change;
      return {
        page: patch(state.page),
        past: state.past.map(patch),
        future: state.future.map(patch),
        relayedEdits: { ...state.relayedEdits, [blockId]: edit },
        isRemoteUpdate: true,
      };
    });
    // Reset flag after microtask so auto-save subscriber can check it
    endRemoteUpdateSoon();
  },

  // --- Toasts ---
  addToast: (message, variant = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    return id;
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // --- Drag & drop (pointer-event based) ---
  initDrag: (source, origin) => {
    set({ dragPending: { source, origin } });
  },

  activateDrag: (position) => {
    const { dragPending } = get();
    if (!dragPending) return;
    set({
      isDragging: true,
      dragSource: dragPending.source,
      dragPosition: position,
      dragPending: null,
    });
  },

  updateDragPosition: (position) => {
    set({ dragPosition: position });
  },

  setCanvasDropIndex: (index) => set({ canvasDropIndex: index }),
  setLayerDropIndex: (index) => set({ layerDropIndex: index }),

  performDrop: () => {
    const { dragSource, canvasDropIndex, layerDropIndex } = get();
    if (!dragSource) {
      get().cancelDrag();
      return;
    }

    const targetIndex = canvasDropIndex ?? layerDropIndex;
    if (targetIndex === null) {
      get().cancelDrag();
      return;
    }

    if (dragSource.action === 'reorder' && dragSource.sourceIndex !== null) {
      const sourceIndex = dragSource.sourceIndex;
      if (sourceIndex !== targetIndex) {
        get().setPageWithHistory((prev) => {
          const newBlocks = [...prev.blocks];
          const [draggedItem] = newBlocks.splice(sourceIndex, 1);
          const finalIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
          newBlocks.splice(finalIndex, 0, draggedItem);
          return { ...prev, blocks: newBlocks };
        });
      }
    } else if (dragSource.action === 'add') {
      get().addBlock(dragSource.type, dragSource.label, targetIndex, dragSource.initialData);
    }

    get().cancelDrag();
  },

  cancelDrag: () => {
    set({
      dragPending: null,
      isDragging: false,
      dragSource: null,
      dragPosition: { x: 0, y: 0 },
      canvasDropIndex: null,
      layerDropIndex: null,
    });
  },
});}));

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Page, SeoFields } from '@/types/page';
import { defaultSeoFields } from '@/types/page';
import type { DesignTokens, ColorTokens, TypographyTokens, SpacingTokens, BorderTokens } from '@/lib/design-tokens';
import { defaultDesignTokens } from '@/lib/design-tokens';
import type { Block, BlockStyles } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';
import type { ToastData } from '@/components/ui/Toast';
import type { DeviceMode, ViewportState, InteractionState, DragSource } from '@/types/editor';
import { generateId } from '@/lib/block-factory';
import { defaultCustomThemeColors } from '@/lib/themes';
import type { ThemeColors } from '@/lib/themes';

// --- Default page (hardcoded to avoid circular dep: block-registry → blocks → EditableText → editor-store) ---

function getDefaultPage(): Page {
  return {
    id: 'page_default',
    name: 'Acme Landing',
    status: 'draft',
    slug: 'acme-landing',
    themeId: 'default',
    seo: { ...defaultSeoFields },
    blocks: [
      { id: 'blk_default_1', type: 'hero', name: 'Hero Section', data: { title: 'Crea landing pages increíbles.', subtitle: 'Un editor visual de próxima generación diseñado para equipos ambiciosos.', buttonText: 'Comenzar gratis', backgroundImage: '', alignment: 'center' }, styles: { ...defaultBlockStyles } },
      { id: 'blk_default_2', type: 'features', name: 'Features Grid', data: { title: 'Descubre las ventajas', feature1Title: 'Característica 1', feature1Desc: 'Descripción breve de esta característica increíble.', feature2Title: 'Característica 2', feature2Desc: 'Descripción breve de esta característica increíble.' }, styles: { ...defaultBlockStyles } },
      { id: 'blk_default_3', type: 'testimonials', name: 'Testimonials', data: { title: 'Lo que dicen de nosotros', quote1: 'Este producto ha cambiado por completo la forma en que trabajamos. Simplemente brillante.', author1: 'María García', role1: 'Product Manager en TechCorp', quote2: 'La mejor decisión que tomamos este año. El soporte es increíble y los resultados inmediatos.', author2: 'Carlos Ruiz', role2: 'CTO en Startup.io' }, styles: { ...defaultBlockStyles } },
      { id: 'blk_default_4', type: 'cta', name: 'Call to Action', data: { title: 'Comienza tu viaje', subtitle: '', buttonText: 'Suscribirse' }, styles: { ...defaultBlockStyles } },
      { id: 'blk_default_5', type: 'footer', name: 'Footer Simple', data: { brandName: 'Acme Corp', description: 'Construyendo el futuro de la web, un bloque a la vez. Únete a nuestra revolución digital.', copyright: '© 2026 Acme Corporation. Todos los derechos reservados.', link1Label: 'Producto', link2Label: 'Precios', link3Label: 'Contacto' }, styles: { ...defaultBlockStyles } },
    ],
  };
}

// --- Types ---

type LeftTab = 'components' | 'layers';

interface InspectorSections {
  content: boolean;
  styles: boolean;
}

export interface CollabUser {
  id: string;
  username: string;
  email: string;
  avatar: string;
}

export interface CursorPosition {
  x: number; // 0-1 relative to canvas width
  y: number; // 0-1 relative to canvas height
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

interface EditorState {
  // Document
  page: Page;
  past: Page[];
  future: Page[];

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

  // Collaboration
  myUserId: string | null;
  connectedUsers: CollabUser[];
  blockLocks: Record<string, string>; // blockId → userId
  cursorPositions: Record<string, CursorPosition>; // userId → cursor
  isRemoteUpdate: boolean;

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
  setPageWithHistory: (updater: Page | ((prev: Page) => Page)) => void;
  addBlock: (type: string, label: string, index?: number | null, initialData?: Record<string, unknown>) => void;
  updateBlock: (id: string, key: string, value: unknown) => void;
  updateBlockStyle: (id: string, styleKey: keyof BlockStyles, value: unknown) => void;
  updateBlockResponsiveStyle: (id: string, device: 'tablet' | 'mobile', styleKey: keyof BlockStyles, value: unknown) => void;
  deleteBlock: (id: string) => void;
  requestDeleteBlock: (id: string) => void;
  cancelDeleteBlock: () => void;
  confirmDeleteBlock: () => void;
  duplicateBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;

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
  setTheme: (themeId: string) => void;
  setCustomThemeColor: (key: string, value: string) => void;
  updateDesignTokenColor: (key: keyof ColorTokens, value: string) => void;
  updateDesignTokenTypography: (key: keyof TypographyTokens, value: string | number) => void;
  updateDesignTokenSpacing: (key: keyof SpacingTokens, value: string) => void;
  updateDesignTokenBorders: (key: keyof BorderTokens, value: string) => void;
  setDesignTokenColors: (colors: ColorTokens) => void;
  updateSeo: (key: keyof SeoFields, value: string | boolean) => void;
  save: () => void;
  resetDemo: () => void;

  // Viewport
  setViewportState: (updater: ViewportState | ((prev: ViewportState) => ViewportState)) => void;
  setInteractionState: (updater: InteractionState | ((prev: InteractionState) => InteractionState)) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Collaboration
  setMyUserId: (id: string) => void;
  setConnectedUsers: (users: CollabUser[]) => void;
  setBlockLocks: (locks: Record<string, string>) => void;
  setBlockLock: (blockId: string, userId: string | null) => void;
  setCursorPosition: (userId: string, x: number, y: number) => void;
  removeCursorPosition: (userId: string) => void;
  replaceBlockData: (blockId: string, newType: string, newData: Record<string, unknown>) => void;
  applyRemoteBlockUpdate: (blockId: string, data?: Record<string, unknown>, styles?: Record<string, unknown>) => void;

  // Toasts
  addToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
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

export const useEditorStore = create<EditorStore>()(subscribeWithSelector((set, get) => {
  return ({
  // --- Initial state ---
  page: getDefaultPage(),
  past: [],
  future: [],
  selectedBlockId: null,
  clipboard: null,
  isPreviewMode: false,
  isQuickEditMode: false,
  deviceMode: 'desktop',
  leftTab: 'components',
  inspectorSections: { content: true, styles: true },
  isSaved: false,
  autoSaveStatus: 'idle',
  myUserId: null,
  connectedUsers: [],
  blockLocks: {},
  cursorPositions: {},
  isRemoteUpdate: false,
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
  setPageWithHistory: (updater) => {
    const { page } = get();
    const newPage = typeof updater === 'function' ? updater(page) : updater;
    if (newPage === page) return;
    set((state) => ({
      page: newPage,
      past: [...state.past, page].slice(-HISTORY_LIMIT),
      future: [],
      isSaved: false,
    }));
  },

  addBlock: (type, label, index = null, initialData) => {
    if (!initialData) return;
    const newId = generateId();
    const newBlock: Block = { id: newId, type, name: label, data: { ...initialData }, styles: { ...defaultBlockStyles } };
    get().setPageWithHistory((prev) => {
      const newBlocks = [...prev.blocks];
      if (index !== null) newBlocks.splice(index, 0, newBlock);
      else newBlocks.push(newBlock);
      return { ...prev, blocks: newBlocks };
    });
    set({ selectedBlockId: newId });
  },

  updateBlock: (id, key, value) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === id ? { ...block, data: { ...block.data, [key]: value } } : block
      ),
    }));
  },

  updateBlockStyle: (id, styleKey, value) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === id
          ? { ...block, styles: { ...(block.styles || defaultBlockStyles), [styleKey]: value } }
          : block
      ),
    }));
  },

  updateBlockResponsiveStyle: (id, device, styleKey, value) => {
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
    }));
  },

  deleteBlock: (id) => {
    const { selectedBlockId } = get();
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

  requestDeleteBlock: (id) => set({ pendingDeleteBlockId: id }),
  cancelDeleteBlock: () => set({ pendingDeleteBlockId: null }),
  confirmDeleteBlock: () => {
    const { pendingDeleteBlockId } = get();
    if (pendingDeleteBlockId) {
      get().deleteBlock(pendingDeleteBlockId);
      set({ pendingDeleteBlockId: null });
    }
  },

  duplicateBlock: (id) => {
    const newId = generateId();
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
    const { isPreviewMode, interactionState } = get();
    if (!isPreviewMode && !interactionState.isSpacePressed && !interactionState.isMiddleClickPanning) {
      set({ selectedBlockId: id });
    }
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
    if (past.length === 0) return;
    const prevState = past[past.length - 1];
    set((state) => ({
      page: prevState,
      past: state.past.slice(0, -1),
      future: [page, ...state.future].slice(0, HISTORY_LIMIT),
    }));
  },

  redo: () => {
    const { future, page } = get();
    if (future.length === 0) return;
    const nextState = future[0];
    set((state) => ({
      page: nextState,
      past: [...state.past, page].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
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
    const newId = generateId();
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
  setTheme: (themeId) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      themeId,
      customTheme: themeId === 'custom' && !prev.customTheme
        ? { ...defaultCustomThemeColors }
        : prev.customTheme,
    }));
  },
  setCustomThemeColor: (key, value) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      customTheme: {
        ...(prev.customTheme || defaultCustomThemeColors),
        [key]: value,
      } as ThemeColors,
    }));
  },
  updateDesignTokenColor: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens || { ...defaultDesignTokens };
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
    });
  },
  updateDesignTokenTypography: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens || { ...defaultDesignTokens };
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
    });
  },
  updateDesignTokenSpacing: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens || { ...defaultDesignTokens };
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
    });
  },
  updateDesignTokenBorders: (key, value) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens || { ...defaultDesignTokens };
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
    });
  },
  setDesignTokenColors: (colors) => {
    get().setPageWithHistory((prev) => {
      const tokens = prev.designTokens || { ...defaultDesignTokens };
      return { ...prev, designTokens: { ...tokens, colors } };
    });
  },
  updateSeo: (key, value) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      seo: { ...(prev.seo || defaultSeoFields), [key]: value },
    }));
  },
  save: () => set({ isSaved: true }),
  resetDemo: () => {
    set({
      page: getDefaultPage(),
      selectedBlockId: null,
      past: [],
      future: [],
      isSaved: false,
    });
  },

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
  setConnectedUsers: (users) => set({ connectedUsers: users }),
  setBlockLocks: (locks) => set({ blockLocks: locks }),
  setBlockLock: (blockId, userId) => {
    set((state) => {
      const newLocks = { ...state.blockLocks };
      if (userId) newLocks[blockId] = userId;
      else delete newLocks[blockId];
      return { blockLocks: newLocks };
    });
  },
  setCursorPosition: (userId, x, y) => {
    const { connectedUsers } = get();
    const user = connectedUsers.find((u) => u.id === userId);
    if (!user) return;
    const color = getUserColor(userId);
    set((state) => ({
      cursorPositions: {
        ...state.cursorPositions,
        [userId]: { x, y, userId, username: user.username, color: color.hex, timestamp: Date.now() },
      },
    }));
  },
  removeCursorPosition: (userId) => {
    set((state) => {
      const { [userId]: _, ...rest } = state.cursorPositions;
      return { cursorPositions: rest };
    });
  },
  replaceBlockData: (blockId, newType, newData) => {
    get().setPageWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === blockId
          ? { ...block, type: newType, data: newData }
          : block
      ),
    }));
  },

  applyRemoteBlockUpdate: (blockId, data, styles) => {
    set({ isRemoteUpdate: true });
    const { page } = get();
    const newPage = {
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          ...(data ? { data: { ...block.data, ...data } } : {}),
          ...(styles ? { styles: { ...block.styles, ...styles } } : {}),
        };
      }),
    };
    set({ page: newPage, isSaved: false });
    // Reset flag after microtask so auto-save subscriber can check it
    queueMicrotask(() => set({ isRemoteUpdate: false }));
  },

  // --- Toasts ---
  addToast: (message, variant = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
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

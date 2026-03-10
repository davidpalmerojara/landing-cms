import { create } from 'zustand';
import type { Page } from '@/types/page';
import type { Block } from '@/types/blocks';
import type { DeviceMode, ViewportState, InteractionState } from '@/types/editor';
import { blockRegistry } from '@/lib/block-registry';
import { generateId } from '@/lib/block-factory';

// --- Default page ---

function getDefaultPage(): Page {
  return {
    id: 'page_default',
    name: 'Acme Landing',
    status: 'draft',
    slug: 'acme-landing',
    blocks: [
      { id: 'blk_default_1', type: 'hero', name: 'Hero Section', data: { ...blockRegistry.hero.initialData, title: 'Crea landing pages increíbles.', subtitle: 'Un editor visual de próxima generación diseñado para equipos ambiciosos.', buttonText: 'Comenzar gratis' } },
      { id: 'blk_default_2', type: 'features', name: 'Features Grid', data: { ...blockRegistry.features.initialData } },
      { id: 'blk_default_3', type: 'testimonials', name: 'Testimonials', data: { ...blockRegistry.testimonials.initialData } },
      { id: 'blk_default_4', type: 'cta', name: 'Call to Action', data: { ...blockRegistry.cta.initialData } },
      { id: 'blk_default_5', type: 'footer', name: 'Footer Simple', data: { ...blockRegistry.footer.initialData } },
    ],
  };
}

// --- Types ---

type LeftTab = 'components' | 'layers';

interface InspectorSections {
  content: boolean;
  styles: boolean;
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
  deviceMode: DeviceMode;
  leftTab: LeftTab;
  inspectorSections: InspectorSections;
  isSaved: boolean;

  // Viewport
  viewportState: ViewportState;
  interactionState: InteractionState;

  // Drag & drop
  isDragging: boolean;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  canvasDropIndex: number | null;
}

interface EditorActions {
  // Page mutations (with history)
  setPageWithHistory: (updater: Page | ((prev: Page) => Page)) => void;
  addBlock: (type: string, label: string, index?: number | null) => void;
  updateBlock: (id: string, key: string, value: unknown) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;

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
  save: () => void;
  resetDemo: () => void;

  // Viewport
  setViewportState: (updater: ViewportState | ((prev: ViewportState) => ViewportState)) => void;
  setInteractionState: (updater: InteractionState | ((prev: InteractionState) => InteractionState)) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Drag & drop
  setDraggedIndex: (index: number | null) => void;
  setDragOverIndex: (index: number | null) => void;
  setCanvasDropIndex: (index: number | null) => void;
  onDragStartGlobal: (index?: number | null) => void;
  onDragEndGlobal: () => void;
  performDrop: (action: string, type: string, label: string, sourceIndex: number | null, targetIndex: number) => void;
}

export type EditorStore = EditorState & EditorActions;

const HISTORY_LIMIT = 50;

export const useEditorStore = create<EditorStore>((set, get) => ({
  // --- Initial state ---
  page: getDefaultPage(),
  past: [],
  future: [],
  selectedBlockId: null,
  clipboard: null,
  isPreviewMode: false,
  deviceMode: 'desktop',
  leftTab: 'components',
  inspectorSections: { content: true, styles: true },
  isSaved: false,
  viewportState: { zoom: 1, x: 0, y: 0 },
  interactionState: { isPanning: false, isSpacePressed: false, isMiddleClickPanning: false },
  isDragging: false,
  draggedIndex: null,
  dragOverIndex: null,
  canvasDropIndex: null,

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

  addBlock: (type, label, index = null) => {
    const config = blockRegistry[type];
    if (!config) return;
    const newId = generateId();
    const newBlock: Block = { id: newId, type, name: label, data: { ...config.initialData } };
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
        // We schedule this after the page update
        setTimeout(() => set({ selectedBlockId: nextSelected }), 0);
      }
      return { ...prev, blocks: remainingBlocks };
    });
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

  // --- History ---
  undo: () => {
    const { past, page } = get();
    if (past.length === 0) return;
    const prevState = past[past.length - 1];
    set((state) => ({
      page: prevState,
      past: state.past.slice(0, -1),
      future: [page, ...state.future],
    }));
  },

  redo: () => {
    const { future, page } = get();
    if (future.length === 0) return;
    const nextState = future[0];
    set((state) => ({
      page: nextState,
      past: [...state.past, page],
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

  // --- Drag & drop ---
  setDraggedIndex: (index) => set({ draggedIndex: index }),
  setDragOverIndex: (index) => set({ dragOverIndex: index }),
  setCanvasDropIndex: (index) => set({ canvasDropIndex: index }),
  onDragStartGlobal: (index = null) => set({ isDragging: true, draggedIndex: index }),
  onDragEndGlobal: () => set({ isDragging: false, draggedIndex: null, canvasDropIndex: null, dragOverIndex: null }),
  performDrop: (action, type, label, sourceIndex, targetIndex) => {
    const { onDragEndGlobal } = get();
    if (action === 'reorder' && sourceIndex !== null) {
      if (sourceIndex === targetIndex) return;
      get().setPageWithHistory((prev) => {
        const newBlocks = [...prev.blocks];
        const [draggedItem] = newBlocks.splice(sourceIndex, 1);
        let finalIndex = targetIndex;
        if (sourceIndex < targetIndex) finalIndex--;
        newBlocks.splice(finalIndex, 0, draggedItem);
        return { ...prev, blocks: newBlocks };
      });
    } else if (action === 'add') {
      get().addBlock(type, label, targetIndex);
    }
    onDragEndGlobal();
  },
}));

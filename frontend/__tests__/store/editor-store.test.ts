import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { defaultBlockStyles, type Block } from '@/types/blocks';
import { defaultSeoFields, type Page } from '@/types/page';
import { defaultDesignTokens } from '@/lib/design-tokens';

function makeBlock(id: string, type = 'hero'): Block {
  return {
    id,
    type,
    name: `${type} block`,
    data: { title: 'Test' },
    styles: { ...defaultBlockStyles },
  };
}

function makePage(blocks: Block[], overrides: Partial<Page> = {}): Page {
  return {
    id: 'test-page-1',
    name: 'Test Page',
    status: 'draft',
    slug: 'test-page',
    themeId: 'default',
    seo: { ...defaultSeoFields },
    blocks,
    ...overrides,
  };
}

function resetStore(blocks: Block[] = [makeBlock('b1'), makeBlock('b2'), makeBlock('b3')], pageOverrides: Partial<Page> = {}) {
  useEditorStore.setState({
    page: makePage(blocks, pageOverrides),
    past: [],
    future: [],
    selectedBlockId: null,
    clipboard: null,
    isPreviewMode: false,
    deviceMode: 'desktop',
    isSaved: false,
    autoSaveStatus: 'idle',
    pendingDeleteBlockId: null,
    isDragging: false,
    dragSource: null,
    canvasDropIndex: null,
    layerDropIndex: null,
    interactionState: { isPanning: false, isSpacePressed: false, isMiddleClickPanning: false },
  });
}

describe('editor-store', () => {
  beforeEach(() => {
    resetStore();
  });

  // --- Block CRUD ---
  describe('addBlock', () => {
    it('adds a block to the end when no index given', () => {
      const { addBlock } = useEditorStore.getState();
      addBlock('cta', 'CTA', null, { title: 'Go' });
      const blocks = useEditorStore.getState().page.blocks;
      expect(blocks).toHaveLength(4);
      expect(blocks[3].type).toBe('cta');
    });

    it('adds a block at specific index', () => {
      const { addBlock } = useEditorStore.getState();
      addBlock('cta', 'CTA', 1, { title: 'Go' });
      const blocks = useEditorStore.getState().page.blocks;
      expect(blocks).toHaveLength(4);
      expect(blocks[1].type).toBe('cta');
    });

    it('selects the new block after adding', () => {
      const { addBlock } = useEditorStore.getState();
      addBlock('cta', 'CTA', null, { title: 'Go' });
      const { selectedBlockId, page } = useEditorStore.getState();
      expect(selectedBlockId).toBe(page.blocks[3].id);
    });

    it('does nothing when initialData is undefined', () => {
      const { addBlock } = useEditorStore.getState();
      addBlock('cta', 'CTA', null, undefined);
      expect(useEditorStore.getState().page.blocks).toHaveLength(3);
    });

    it('adds block to empty page', () => {
      resetStore([]);
      const { addBlock } = useEditorStore.getState();
      addBlock('hero', 'Hero', null, { title: 'Hello' });
      expect(useEditorStore.getState().page.blocks).toHaveLength(1);
    });
  });

  describe('updateBlock (updateBlockData)', () => {
    it('changes block data for the correct block', () => {
      const { updateBlock } = useEditorStore.getState();
      updateBlock('b2', 'title', 'New Title');
      const block = useEditorStore.getState().page.blocks.find((b) => b.id === 'b2');
      expect(block?.data.title).toBe('New Title');
    });
  });

  describe('deleteBlock', () => {
    it('removes the block from the array', () => {
      const { deleteBlock } = useEditorStore.getState();
      deleteBlock('b2');
      const ids = useEditorStore.getState().page.blocks.map((b) => b.id);
      expect(ids).not.toContain('b2');
      expect(ids).toHaveLength(2);
    });

    it('selects adjacent block when deleted block was selected', async () => {
      useEditorStore.setState({ selectedBlockId: 'b2' });
      const { deleteBlock } = useEditorStore.getState();
      deleteBlock('b2');
      // deleteBlock uses setTimeout for selecting next block
      await new Promise((r) => setTimeout(r, 10));
      const { selectedBlockId } = useEditorStore.getState();
      // Should select b3 (next) or b1 (prev)
      expect(['b1', 'b3']).toContain(selectedBlockId);
    });

    it('sets selectedBlockId to null when deleting last remaining block', async () => {
      resetStore([makeBlock('only')]);
      useEditorStore.setState({ selectedBlockId: 'only' });
      const { deleteBlock } = useEditorStore.getState();
      deleteBlock('only');
      await new Promise((r) => setTimeout(r, 10));
      expect(useEditorStore.getState().selectedBlockId).toBeNull();
    });
  });

  describe('duplicateBlock', () => {
    it('creates a copy with a new ID inserted after the original', () => {
      const { duplicateBlock } = useEditorStore.getState();
      duplicateBlock('b1');
      const blocks = useEditorStore.getState().page.blocks;
      expect(blocks).toHaveLength(4);
      expect(blocks[1].type).toBe('hero');
      expect(blocks[1].id).not.toBe('b1');
    });

    it('selects the duplicated block', () => {
      const { duplicateBlock } = useEditorStore.getState();
      duplicateBlock('b2');
      const { selectedBlockId, page } = useEditorStore.getState();
      // The new block is at index 2
      expect(selectedBlockId).toBe(page.blocks[2].id);
      expect(selectedBlockId).not.toBe('b2');
    });
  });

  // --- Selection ---
  describe('selectBlock', () => {
    it('sets selectedBlockId', () => {
      useEditorStore.getState().selectBlock('b2');
      expect(useEditorStore.getState().selectedBlockId).toBe('b2');
    });

    it('sets selectedBlockId to null', () => {
      useEditorStore.setState({ selectedBlockId: 'b1' });
      useEditorStore.getState().selectBlock(null);
      expect(useEditorStore.getState().selectedBlockId).toBeNull();
    });

    it('does not change selection in preview mode', () => {
      useEditorStore.setState({ isPreviewMode: true, selectedBlockId: null });
      useEditorStore.getState().selectBlock('b1');
      expect(useEditorStore.getState().selectedBlockId).toBeNull();
    });
  });

  // --- History ---
  describe('undo / redo', () => {
    it('undo restores previous page state', () => {
      const originalBlocks = useEditorStore.getState().page.blocks.length;
      useEditorStore.getState().addBlock('cta', 'CTA', null, { title: 'Go' });
      expect(useEditorStore.getState().page.blocks).toHaveLength(originalBlocks + 1);

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().page.blocks).toHaveLength(originalBlocks);
    });

    it('redo restores undone state', () => {
      useEditorStore.getState().addBlock('cta', 'CTA', null, { title: 'Go' });
      useEditorStore.getState().undo();
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().page.blocks).toHaveLength(4);
    });

    it('undo with empty history does nothing', () => {
      const before = useEditorStore.getState().page;
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().page).toBe(before);
    });

    it('redo with empty future does nothing', () => {
      const before = useEditorStore.getState().page;
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().page).toBe(before);
    });

    it('new mutation clears redo stack', () => {
      useEditorStore.getState().addBlock('cta', 'CTA', null, { title: '1' });
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().future.length).toBeGreaterThan(0);

      useEditorStore.getState().addBlock('cta', 'CTA', null, { title: '2' });
      expect(useEditorStore.getState().future).toHaveLength(0);
    });

    it('history is capped at 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        useEditorStore.getState().updateBlock('b1', 'title', `Title ${i}`);
      }
      expect(useEditorStore.getState().past.length).toBeLessThanOrEqual(50);
    });
  });

  // --- DnD: performDrop ---
  describe('performDrop', () => {
    it('reorders blocks when source < target', () => {
      // Move b1 (index 0) to after b3 (target index 2)
      useEditorStore.setState({
        isDragging: true,
        dragSource: { action: 'reorder', type: 'hero', label: 'Hero', sourceIndex: 0, initialData: undefined },
        canvasDropIndex: 2,
      });
      useEditorStore.getState().performDrop();
      const ids = useEditorStore.getState().page.blocks.map((b) => b.id);
      // After removing index 0 and inserting at index 2-1=1: [b2, b1, b3]
      expect(ids).toEqual(['b2', 'b1', 'b3']);
    });

    it('reorders blocks when source > target', () => {
      // Move b3 (index 2) to index 0
      useEditorStore.setState({
        isDragging: true,
        dragSource: { action: 'reorder', type: 'hero', label: 'Hero', sourceIndex: 2, initialData: undefined },
        canvasDropIndex: 0,
      });
      useEditorStore.getState().performDrop();
      const ids = useEditorStore.getState().page.blocks.map((b) => b.id);
      expect(ids).toEqual(['b3', 'b1', 'b2']);
    });

    it('same index = no reorder (no history entry)', () => {
      const pastLength = useEditorStore.getState().past.length;
      useEditorStore.setState({
        isDragging: true,
        dragSource: { action: 'reorder', type: 'hero', label: 'Hero', sourceIndex: 1, initialData: undefined },
        canvasDropIndex: 1,
      });
      useEditorStore.getState().performDrop();
      const ids = useEditorStore.getState().page.blocks.map((b) => b.id);
      expect(ids).toEqual(['b1', 'b2', 'b3']);
      expect(useEditorStore.getState().past.length).toBe(pastLength);
    });

    it('cancels drag when no target index', () => {
      useEditorStore.setState({
        isDragging: true,
        dragSource: { action: 'reorder', type: 'hero', label: 'Hero', sourceIndex: 0, initialData: undefined },
        canvasDropIndex: null,
        layerDropIndex: null,
      });
      useEditorStore.getState().performDrop();
      expect(useEditorStore.getState().isDragging).toBe(false);
    });
  });

  // --- Clipboard ---
  describe('copy / paste', () => {
    it('copy stores selected block in clipboard', () => {
      useEditorStore.setState({ selectedBlockId: 'b1' });
      useEditorStore.getState().copy();
      expect(useEditorStore.getState().clipboard).not.toBeNull();
      expect(useEditorStore.getState().clipboard!.type).toBe('hero');
    });

    it('paste creates new block with different ID', () => {
      useEditorStore.setState({ selectedBlockId: 'b1' });
      useEditorStore.getState().copy();
      useEditorStore.getState().paste();
      const blocks = useEditorStore.getState().page.blocks;
      expect(blocks).toHaveLength(4);
      // Pasted after b1 (index 0) so at index 1
      expect(blocks[1].id).not.toBe('b1');
      expect(blocks[1].type).toBe('hero');
    });

    it('paste with empty clipboard is no-op', () => {
      useEditorStore.getState().paste();
      expect(useEditorStore.getState().page.blocks).toHaveLength(3);
    });

    it('copy with no selection is no-op', () => {
      useEditorStore.getState().copy();
      expect(useEditorStore.getState().clipboard).toBeNull();
    });
  });

  // --- Design Tokens ---
  describe('updateDesignTokenColor', () => {
    it('updates the correct color in design tokens', () => {
      useEditorStore.getState().updateDesignTokenColor('primary', '#ff0000');
      const tokens = useEditorStore.getState().page.designTokens;
      expect(tokens?.colors.primary).toBe('#ff0000');
    });

    it('initializes designTokens from defaults if not present', () => {
      // default page from resetStore has no designTokens
      useEditorStore.getState().updateDesignTokenColor('accent', '#123456');
      const tokens = useEditorStore.getState().page.designTokens;
      expect(tokens).toBeDefined();
      expect(tokens!.colors.accent).toBe('#123456');
      // other colors should be defaults
      expect(tokens!.colors.primary).toBe(defaultDesignTokens.colors.primary);
    });
  });

  describe('setDesignTokenColors', () => {
    it('replaces all colors', () => {
      const newColors = { ...defaultDesignTokens.colors, primary: '#aabbcc', secondary: '#ddeeff' };
      useEditorStore.getState().setDesignTokenColors(newColors);
      const tokens = useEditorStore.getState().page.designTokens;
      expect(tokens?.colors.primary).toBe('#aabbcc');
      expect(tokens?.colors.secondary).toBe('#ddeeff');
    });
  });

  // --- Responsive Styles ---
  describe('updateBlockResponsiveStyle', () => {
    it('sets override for tablet', () => {
      useEditorStore.getState().updateBlockResponsiveStyle('b1', 'tablet', 'paddingTop', 20);
      const block = useEditorStore.getState().page.blocks.find((b) => b.id === 'b1');
      expect(block?.responsiveStyles?.tablet?.paddingTop).toBe(20);
    });

    it('removes override if value matches base style', () => {
      // First set an override
      useEditorStore.getState().updateBlockResponsiveStyle('b1', 'mobile', 'paddingTop', 20);
      let block = useEditorStore.getState().page.blocks.find((b) => b.id === 'b1');
      expect(block?.responsiveStyles?.mobile?.paddingTop).toBe(20);

      // Set back to base value (0 is default paddingTop)
      useEditorStore.getState().updateBlockResponsiveStyle('b1', 'mobile', 'paddingTop', 0);
      block = useEditorStore.getState().page.blocks.find((b) => b.id === 'b1');
      // Override should be removed
      expect(block?.responsiveStyles?.mobile?.paddingTop).toBeUndefined();
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('addBlock to empty page works', () => {
      resetStore([]);
      useEditorStore.getState().addBlock('hero', 'Hero', null, { title: 'Hi' });
      expect(useEditorStore.getState().page.blocks).toHaveLength(1);
      expect(useEditorStore.getState().selectedBlockId).toBe(
        useEditorStore.getState().page.blocks[0].id
      );
    });

    it('updateBlockStyle changes a style property', () => {
      useEditorStore.getState().updateBlockStyle('b1', 'paddingTop', 32);
      const block = useEditorStore.getState().page.blocks.find((b) => b.id === 'b1');
      expect(block?.styles.paddingTop).toBe(32);
    });

    it('togglePreview toggles isPreviewMode', () => {
      expect(useEditorStore.getState().isPreviewMode).toBe(false);
      useEditorStore.getState().togglePreview();
      expect(useEditorStore.getState().isPreviewMode).toBe(true);
      useEditorStore.getState().togglePreview();
      expect(useEditorStore.getState().isPreviewMode).toBe(false);
    });

    it('setDeviceMode changes device mode', () => {
      useEditorStore.getState().setDeviceMode('tablet');
      expect(useEditorStore.getState().deviceMode).toBe('tablet');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore, HISTORY_COALESCE_MS } from '@/store/editor-store';
import { defaultBlockStyles } from '@/types/blocks';
import { defaultSeoFields } from '@/types/page';
import type { Page } from '@/types/page';

function makePage(id: string, title = 'Start'): Page {
  return {
    id,
    name: 'Test',
    status: 'draft',
    slug: 'test',
    themeId: 'default',
    seo: { ...defaultSeoFields },
    blocks: [{ id: 'b1', type: 'hero', name: 'Hero', data: { title, subtitle: '' }, styles: { ...defaultBlockStyles } }],
  };
}

const title = () => useEditorStore.getState().page.blocks[0].data.title;

describe('editor history', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.getState().loadPage(makePage('p1'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns consecutive keystrokes in one field into a single undo step', () => {
    const { updateBlock } = useEditorStore.getState();
    for (const value of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      updateBlock('b1', 'title', value);
      vi.advanceTimersByTime(100);
    }

    expect(useEditorStore.getState().past).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(title()).toBe('Start');
  });

  it('starts a new step after a pause', () => {
    const { updateBlock } = useEditorStore.getState();
    updateBlock('b1', 'title', 'Hello');
    vi.advanceTimersByTime(HISTORY_COALESCE_MS + 1);
    updateBlock('b1', 'title', 'Hello world');

    expect(useEditorStore.getState().past).toHaveLength(2);
    useEditorStore.getState().undo();
    expect(title()).toBe('Hello');
  });

  it('keeps edits to different fields as separate steps', () => {
    const { updateBlock } = useEditorStore.getState();
    updateBlock('b1', 'title', 'A');
    updateBlock('b1', 'subtitle', 'B');

    expect(useEditorStore.getState().past).toHaveLength(2);
  });

  it('does not merge typing across an undo', () => {
    const { updateBlock } = useEditorStore.getState();
    updateBlock('b1', 'title', 'A');
    useEditorStore.getState().undo();
    updateBlock('b1', 'title', 'B');

    expect(useEditorStore.getState().past).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(title()).toBe('Start');
  });

  describe('loadPage', () => {
    it('clears history and selection so undo cannot bring back another page', () => {
      useEditorStore.getState().updateBlock('b1', 'title', 'Edited on page 1');
      useEditorStore.getState().selectBlock('b1');

      useEditorStore.getState().loadPage(makePage('p2', 'Page 2'));
      useEditorStore.getState().undo();

      const state = useEditorStore.getState();
      expect(state.page.id).toBe('p2');
      expect(title()).toBe('Page 2');
      expect(state.past).toEqual([]);
      expect(state.future).toEqual([]);
      expect(state.selectedBlockId).toBeNull();
      expect(state.isSaved).toBe(true);
    });

    it('is flagged as a remote update so autosave does not send it back', () => {
      const seen: boolean[] = [];
      const unsub = useEditorStore.subscribe(
        (s) => s.page,
        () => seen.push(useEditorStore.getState().isRemoteUpdate),
      );

      useEditorStore.getState().loadPage(makePage('p3'));
      unsub();

      expect(seen).toEqual([true]);
    });
  });
});

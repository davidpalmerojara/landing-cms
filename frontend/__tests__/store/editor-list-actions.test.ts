import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore, HISTORY_COALESCE_MS } from '@/store/editor-store';
import { defaultBlockStyles } from '@/types/blocks';
import { defaultSeoFields } from '@/types/page';
import { getAtPath, makeBlock } from '@/lib/block-data';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';

const BLOCK = 'b1';

function loadFaq(questions: string[]) {
  useEditorStore.getState().loadPage({
    id: 'p1',
    name: 'Test',
    status: 'draft',
    slug: 'test',
    designTokens: cloneDesignTokens(defaultDesignTokens),
    seo: { ...defaultSeoFields },
    blocks: [
      makeBlock({ id: BLOCK, name: 'FAQ', styles: { ...defaultBlockStyles } }, 'faq', {
        title: 'FAQ',
        questions: questions.map((question) => ({ question, answer: '' })),
      }),
    ],
  });
}

const data = () => useEditorStore.getState().page.blocks[0].data;
const questions = () => {
  const list = getAtPath(data(), ['questions']);
  return Array.isArray(list) ? list.map((item) => getAtPath(item, ['question'])) : [];
};
const pastLength = () => useEditorStore.getState().past.length;

describe('updateBlockField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadFaq(['Q1', 'Q2']);
  });
  afterEach(() => vi.useRealTimers());

  it('sets a value inside a list item', () => {
    useEditorStore.getState().updateBlockField(BLOCK, ['questions', 1, 'question'], 'Edited');
    expect(questions()).toEqual(['Q1', 'Edited']);
  });

  it('coalesces typing in one path into one undo step', () => {
    const { updateBlockField } = useEditorStore.getState();
    for (const value of ['E', 'Ed', 'Edi']) {
      updateBlockField(BLOCK, ['questions', 0, 'question'], value);
      vi.advanceTimersByTime(100);
    }
    expect(pastLength()).toBe(1);
    useEditorStore.getState().undo();
    expect(questions()).toEqual(['Q1', 'Q2']);
  });

  it('keeps separate undo steps for different paths', () => {
    const { updateBlockField } = useEditorStore.getState();
    updateBlockField(BLOCK, ['questions', 0, 'question'], 'A');
    updateBlockField(BLOCK, ['questions', 1, 'question'], 'B');
    expect(pastLength()).toBe(2);
    useEditorStore.getState().undo();
    expect(questions()).toEqual(['A', 'Q2']);
  });

  it('ignores paths that do not exist and coerces wrong types', () => {
    const { updateBlockField } = useEditorStore.getState();
    updateBlockField(BLOCK, ['questions', 5, 'question'], 'X');
    updateBlockField(BLOCK, ['nope'], 'X');
    expect(pastLength()).toBe(0);
    updateBlockField(BLOCK, ['questions', 0, 'question'], 42);
    expect(questions()).toEqual(['', 'Q2']);
  });

  it('updateBlock is the top-level shortcut', () => {
    useEditorStore.getState().updateBlock(BLOCK, 'title', 'Preguntas');
    expect(getAtPath(data(), ['title'])).toBe('Preguntas');
  });
});

describe('structural list actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadFaq(['Q1', 'Q2', 'Q3']);
  });
  afterEach(() => vi.useRealTimers());

  it('adds, removes and moves items', () => {
    const store = useEditorStore.getState();
    store.addListItem(BLOCK, 'questions', { question: 'Q4', answer: 'A4' });
    expect(questions()).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    store.removeListItem(BLOCK, 'questions', 0);
    expect(questions()).toEqual(['Q2', 'Q3', 'Q4']);
    store.moveListItem(BLOCK, 'questions', 2, 0);
    expect(questions()).toEqual(['Q4', 'Q2', 'Q3']);
  });

  it('normalizes the added item', () => {
    useEditorStore.getState().addListItem(BLOCK, 'questions', { question: 'New', junk: true });
    expect(getAtPath(data(), ['questions', 3])).toEqual({ question: 'New', answer: '' });
  });

  it('does not add past the maximum', () => {
    loadFaq(Array.from({ length: 12 }, (_, i) => `Q${i}`));
    useEditorStore.getState().addListItem(BLOCK, 'questions', { question: 'Extra' });
    expect(questions()).toHaveLength(12);
    expect(pastLength()).toBe(0);
  });

  it('makes each structural change its own undo step, never merged with typing', () => {
    const store = useEditorStore.getState();
    store.updateBlockField(BLOCK, ['questions', 0, 'question'], 'Typed');
    store.addListItem(BLOCK, 'questions', { question: 'Q4' });
    store.updateBlockField(BLOCK, ['questions', 0, 'question'], 'Typed more');
    store.moveListItem(BLOCK, 'questions', 0, 1);
    store.removeListItem(BLOCK, 'questions', 3);
    expect(pastLength()).toBe(5);

    store.undo();
    expect(questions()).toEqual(['Q2', 'Typed more', 'Q3', 'Q4']);
    store.undo();
    expect(questions()).toEqual(['Typed more', 'Q2', 'Q3', 'Q4']);
    store.undo();
    expect(questions()).toEqual(['Typed', 'Q2', 'Q3', 'Q4']);
    store.undo();
    expect(questions()).toEqual(['Typed', 'Q2', 'Q3']);
    store.undo();
    expect(questions()).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('typing the same path right after a structural change starts a new step', () => {
    const store = useEditorStore.getState();
    store.updateBlockField(BLOCK, ['questions', 0, 'question'], 'A');
    store.moveListItem(BLOCK, 'questions', 1, 2);
    vi.advanceTimersByTime(HISTORY_COALESCE_MS / 2);
    store.updateBlockField(BLOCK, ['questions', 0, 'question'], 'AB');
    expect(pastLength()).toBe(3);
  });
});

describe('data from outside the editor', () => {
  beforeEach(() => loadFaq(['Q1']));

  it('normalizes remote updates, which replace the data (a key left out is emptied)', () => {
    useEditorStore.getState().applyRemoteBlockUpdate(BLOCK, { questions: [{ question: 'Remote' }, 'bad'], q1: 'old' });
    expect(data()).toEqual({ title: '', questions: [{ question: 'Remote', answer: '' }] });
  });

  it('replaces data from the AI only for known types', () => {
    const store = useEditorStore.getState();
    expect(store.replaceBlockData(BLOCK, 'nonsense', {})).toBe(false);
    expect(questions()).toEqual(['Q1']);
    expect(store.replaceBlockData(BLOCK, 'logoCloud', { title: 'Logos', logos: [{ name: 'Acme' }] })).toBe(true);
    const block = useEditorStore.getState().page.blocks[0];
    expect(block.type).toBe('logoCloud');
    expect(block.data).toEqual({ title: 'Logos', logos: [{ name: 'Acme' }] });
  });

  it('addBlock normalizes the initial data', () => {
    useEditorStore.getState().addBlock('stats', 'Stats', null, { title: 'Cifras', stats: [{ value: '1' }] });
    const added = useEditorStore.getState().page.blocks[1];
    expect(added.data).toEqual({ title: 'Cifras', subtitle: '', stats: [{ value: '1', label: '' }] });
  });
});

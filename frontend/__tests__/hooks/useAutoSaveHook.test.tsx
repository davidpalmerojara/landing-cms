import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { AUTO_SAVE_DELAY, COLLAB_AUTO_SAVE_DELAY, autoSaveDelay, useAutoSave } from '@/hooks/useAutoSave';
import { makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';

const BLOCK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function Harness({ save }: { save: () => Promise<boolean> }) {
  useAutoSave(save);
  return null;
}

const presenceOf = (count: number) => Array.from({ length: count }, (_, i) => ({
  connectionId: `conn-${i}`, userId: `user-${i}`, username: `user ${i}`,
}));

describe('useAutoSave (hook)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEditorStore(makePage([makeBlock('cta', { title: 'A' }, { id: BLOCK })], { id: 'server-page' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks the debounce from the number of connections', () => {
    expect(autoSaveDelay(0)).toBe(AUTO_SAVE_DELAY);
    expect(autoSaveDelay(1)).toBe(COLLAB_AUTO_SAVE_DELAY);
    expect(autoSaveDelay(2)).toBe(COLLAB_AUTO_SAVE_DELAY);
    expect(COLLAB_AUTO_SAVE_DELAY).toBeLessThan(AUTO_SAVE_DELAY);
  });

  it('waits 3 s when editing alone', async () => {
    useEditorStore.setState({ presence: presenceOf(1), myConnectionId: 'conn-0' });
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<Harness save={save} />);

    act(() => { useEditorStore.getState().updateBlock(BLOCK, 'title', 'Edited'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(COLLAB_AUTO_SAVE_DELAY + 100); });
    expect(save).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY); });
    expect(save).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('saves sooner while someone else is connected', async () => {
    useEditorStore.setState({ presence: presenceOf(2), myConnectionId: 'conn-0' });
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<Harness save={save} />);

    act(() => { useEditorStore.getState().updateBlock(BLOCK, 'title', 'Edited'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(COLLAB_AUTO_SAVE_DELAY); });

    expect(save).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('stops saving once access to the page is revoked', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<Harness save={save} />);

    act(() => { useEditorStore.getState().setCollabStatus('revoked'); });
    act(() => { useEditorStore.getState().updateBlock(BLOCK, 'title', 'Edited'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2); });

    expect(save).not.toHaveBeenCalled();
    view.unmount();
  });

  it('drops a save that was already waiting when access is revoked', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<Harness save={save} />);

    act(() => { useEditorStore.getState().updateBlock(BLOCK, 'title', 'Edited'); });
    act(() => { useEditorStore.getState().setCollabStatus('revoked'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2); });

    expect(save).not.toHaveBeenCalled();
    expect(useEditorStore.getState().autoSaveStatus).toBe('idle');
    view.unmount();
  });

  it('does not save a page that came from the server', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<Harness save={save} />);
    const { page } = useEditorStore.getState();

    act(() => { useEditorStore.getState().applyRemotePage({ ...page, name: 'Remote name' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2); });

    expect(save).not.toHaveBeenCalled();
    view.unmount();
  });
});

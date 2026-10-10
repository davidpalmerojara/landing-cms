import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { AUTO_SAVE_DELAY, COLLAB_AUTO_SAVE_DELAY, autoSaveDelay, useAutoSave } from '@/hooks/useAutoSave';
import type { AutoSaveLeaveHandlers } from '@/hooks/useAutoSave';
import { flushPendingSave } from '@/lib/save-flush';
import type { SaveOptions } from '@/lib/page-sync';
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

describe('useAutoSave: an edit is never left behind (QA-003)', () => {
  function LeaveHarness({ save, handlers }: { save: (options?: SaveOptions) => Promise<boolean>; handlers?: AutoSaveLeaveHandlers }) {
    useAutoSave(save, handlers);
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetEditorStore(makePage([makeBlock('cta', { title: 'A' }, { id: BLOCK })], { id: 'server-page' }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const edit = (title: string) => act(() => { useEditorStore.getState().updateBlock(BLOCK, 'title', title); });

  it('leaving the editor before the autosave fires sends the change once, right away', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<LeaveHarness save={save} />);

    edit('Typed and left');
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2); });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps every edit in the local backup at once, before any save', () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<LeaveHarness save={save} />);

    edit('In the backup already');

    expect(localStorage.getItem('paxl-page-backup:server-page')).toContain('In the backup already');
    expect(save).not.toHaveBeenCalled();
    view.unmount();
  });

  it('closing the tab sends the pending change through saveOnLeave (keepalive)', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const saveOnLeave = vi.fn().mockReturnValue(true);
    const view = render(<LeaveHarness save={save} handlers={{ saveOnLeave }} />);

    edit('Typed and closed');
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(saveOnLeave).toHaveBeenCalledTimes(1);
    // The debounced save does not send it a second time
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY * 2); });
    expect(save).not.toHaveBeenCalled();
    view.unmount();
  });

  it('hiding the tab sends the pending change with keepalive', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<LeaveHarness save={save} />);
    edit('Typed and switched tab');

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    visibility.mockRestore();

    expect(save).toHaveBeenCalledWith({ keepalive: true });
    view.unmount();
  });

  it('asks before closing when the change could not be sent', () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<LeaveHarness save={save} handlers={{ saveOnLeave: () => false }} />);
    edit('Cannot be sent now');

    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    view.unmount();
  });

  it('does not ask when there is nothing pending', () => {
    const save = vi.fn().mockResolvedValue(true);
    const view = render(<LeaveHarness save={save} handlers={{ saveOnLeave: () => false, hasUnsavedChanges: () => false }} />);

    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(false);
    view.unmount();
  });

  it('flushPendingSave sends the pending change now and resolves with its result', async () => {
    const save = vi.fn().mockResolvedValue(false);
    const view = render(<LeaveHarness save={save} />);

    await expect(flushPendingSave()).resolves.toBe(true); // nothing pending
    expect(save).not.toHaveBeenCalled();

    edit('Needed by the version');
    let result = true;
    await act(async () => { result = await flushPendingSave(); });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
    view.unmount();
    // No editor open: nothing to flush
    await expect(flushPendingSave()).resolves.toBe(true);
  });
});

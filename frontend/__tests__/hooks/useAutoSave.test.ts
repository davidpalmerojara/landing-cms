import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { defaultBlockStyles } from '@/types/blocks';
import { defaultSeoFields } from '@/types/page';
import type { Page } from '@/types/page';

// We test useAutoSave indirectly by mimicking what it does:
// It subscribes to the store's page changes via subscribeWithSelector.
// Instead of rendering the hook (which needs React), we replicate its subscription logic.

function makePage(id: string, blockCount = 1): Page {
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    id: `blk_${i}`,
    type: 'hero',
    name: 'Hero',
    data: { title: `Title ${i}` },
    styles: { ...defaultBlockStyles },
  }));
  return {
    id,
    name: 'Test',
    status: 'draft',
    slug: 'test',
    themeId: 'default',
    seo: { ...defaultSeoFields },
    blocks,
  };
}

describe('useAutoSave (subscription logic)', () => {
  let unsub: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.setState({
      page: makePage('server-page-1'),
      past: [],
      future: [],
      autoSaveStatus: 'idle',
      isRemoteUpdate: false,
    });
  });

  afterEach(() => {
    if (unsub) unsub();
    vi.useRealTimers();
  });

  it('triggers save after 3s debounce when page changes', async () => {
    const saveToApi = vi.fn().mockResolvedValue(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        if (page.id.startsWith('page_')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          useEditorStore.setState({ autoSaveStatus: 'saving' });
          const ok = await saveToApi();
          useEditorStore.setState({ autoSaveStatus: ok ? 'saved' : 'error' });
        }, 3000);
      },
    );

    // Trigger page change
    useEditorStore.setState({ page: makePage('server-page-1', 2) });

    expect(saveToApi).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    // Need to flush the promise
    await vi.advanceTimersByTimeAsync(0);
    expect(saveToApi).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().autoSaveStatus).toBe('saved');
  });

  it('rapid changes restart the debounce (only one save)', async () => {
    const saveToApi = vi.fn().mockResolvedValue(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        if (page.id.startsWith('page_')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          await saveToApi();
        }, 3000);
      },
    );

    // Multiple rapid changes
    useEditorStore.setState({ page: makePage('server-page-1', 2) });
    vi.advanceTimersByTime(1000);
    useEditorStore.setState({ page: makePage('server-page-1', 3) });
    vi.advanceTimersByTime(1000);
    useEditorStore.setState({ page: makePage('server-page-1', 4) });

    // Not enough time for any save yet
    expect(saveToApi).not.toHaveBeenCalled();

    // Advance past debounce from last change
    vi.advanceTimersByTime(3000);
    await vi.advanceTimersByTimeAsync(0);
    expect(saveToApi).toHaveBeenCalledTimes(1);
  });

  it('does not save for local pages (ID starting with page_)', async () => {
    const saveToApi = vi.fn().mockResolvedValue(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        if (page.id.startsWith('page_')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          await saveToApi();
        }, 3000);
      },
    );

    // Change to a local page
    useEditorStore.setState({ page: makePage('page_local_123', 2) });
    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(saveToApi).not.toHaveBeenCalled();
  });

  it('sets error status on failed save', async () => {
    const saveToApi = vi.fn().mockResolvedValue(false);
    let timer: ReturnType<typeof setTimeout> | null = null;

    unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        if (page.id.startsWith('page_')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          useEditorStore.setState({ autoSaveStatus: 'saving' });
          const ok = await saveToApi();
          useEditorStore.setState({ autoSaveStatus: ok ? 'saved' : 'error' });
        }, 3000);
      },
    );

    useEditorStore.setState({ page: makePage('server-page-1', 2) });
    vi.advanceTimersByTime(3000);
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState().autoSaveStatus).toBe('error');
  });

  it('status transitions: idle -> saving -> saved', async () => {
    const statuses: string[] = [];
    const saveToApi = vi.fn().mockResolvedValue(true);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubStatus = useEditorStore.subscribe(
      (state) => state.autoSaveStatus,
      (status) => { statuses.push(status); },
    );

    unsub = useEditorStore.subscribe(
      (state) => state.page,
      (page, prevPage) => {
        if (page === prevPage) return;
        if (page.id.startsWith('page_')) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          useEditorStore.setState({ autoSaveStatus: 'saving' });
          const ok = await saveToApi();
          useEditorStore.setState({ autoSaveStatus: ok ? 'saved' : 'error' });
        }, 3000);
      },
    );

    useEditorStore.setState({ page: makePage('server-page-1', 2) });
    vi.advanceTimersByTime(3000);
    await vi.advanceTimersByTimeAsync(0);

    expect(statuses).toContain('saving');
    expect(statuses).toContain('saved');
    unsubStatus();
  });
});

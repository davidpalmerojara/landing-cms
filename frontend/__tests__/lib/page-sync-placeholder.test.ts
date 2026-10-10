/**
 * APP2-005: opening /editor/<id> for a page that does not exist leaves the
 * store's placeholder page on screen. Leaving must not try to create it on
 * the server, and the tab must not ask "Leave site?" for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { PageSyncController } from '@/lib/page-sync';
import { getDefaultPage } from '@/lib/default-page';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { pages: { get: vi.fn(), update: vi.fn(), create: vi.fn() } },
  };
});

const { api } = await import('@/lib/api');

describe('PageSyncController with the placeholder page (APP2-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({ page: getDefaultPage('es'), syncBase: null, collabStatus: 'idle' });
  });

  it('opened by id: never creates the placeholder on the server, and has nothing to save', async () => {
    const sync = new PageSyncController('11111111-2222-3333-4444-555555555555');

    expect(sync.hasUnsavedChanges()).toBe(false);
    expect(await sync.save()).toBe(true);
    expect(sync.saveOnLeave()).toBe(true);

    expect(api.pages.create).not.toHaveBeenCalled();
    expect(api.pages.update).not.toHaveBeenCalled();
  });

  it('without an id (a page that only exists in the editor) the first save still creates it', async () => {
    vi.mocked(api.pages.create).mockRejectedValue(new Error('offline'));
    const sync = new PageSyncController('');

    await sync.save();

    expect(api.pages.create).toHaveBeenCalledTimes(1);
  });
});

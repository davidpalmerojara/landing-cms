import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import type { ApiPage } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { usePageSync } from '@/hooks/usePageSync';
import type { RemotePageChange } from '@/hooks/usePageSync';
import { MAX_CONFLICT_RETRIES } from '@/lib/page-sync';
import { presetTokens, tokensToApi } from '@/lib/design-tokens';
import { render } from '../mobile-editor/test-utils';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      pages: {
        get: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        list: vi.fn(),
        publish: vi.fn(),
      },
      versions: {
        restore: vi.fn(),
      },
    },
  };
});

const { api } = await import('@/lib/api');
const getPage = vi.mocked(api.pages.get);
const updatePage = vi.mocked(api.pages.update);
const publishPage = vi.mocked(api.pages.publish);
const restoreVersion = vi.mocked(api.versions.restore);

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const BLOCK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BLOCK_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type ApiBlocks = ApiPage['blocks'];

function apiBlocks(titles: { a?: string; b?: string } = {}): ApiBlocks {
  return [
    { id: BLOCK_A, type: 'hero', order: 0, data: { title: titles.a ?? 'A' }, styles: {} },
    { id: BLOCK_B, type: 'cta', order: 1, data: { title: titles.b ?? 'B' }, styles: {} },
  ] as unknown as ApiBlocks;
}

function apiPage(overrides: Partial<ApiPage> = {}): ApiPage {
  return {
    id: PAGE_ID,
    version: 1,
    name: 'Landing',
    slug: 'landing',
    status: 'draft',
    design_tokens: {},
    seo_title: '',
    seo_description: '',
    seo_canonical_url: '',
    og_title: '',
    og_description: '',
    og_image: '',
    og_type: 'website',
    noindex: false,
    blocks: apiBlocks(),
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as ApiPage;
}

function conflict(page: ApiPage): ApiError {
  return new ApiError(409, JSON.stringify({ error: 'stale', code: 'VERSION_CONFLICT', page }));
}

/** The page the server would answer to a PUT of `body` at `version`. */
function echo(body: Record<string, unknown>, version: number): ApiPage {
  return apiPage({ ...(body as Partial<ApiPage>), version });
}

type Sync = ReturnType<typeof usePageSync>;
let sync: Sync;
const onRemoteMerged = vi.fn();
const onSaveFailed = vi.fn();

function Harness({ pageId, onSync }: { pageId: string; onSync: (s: Sync) => void }) {
  const result = usePageSync(pageId, { onRemoteMerged, onSaveFailed });
  useEffect(() => onSync(result));
  return null;
}

async function mount(pageId = PAGE_ID) {
  const view = render(<Harness pageId={pageId} onSync={(s) => { sync = s; }} />);
  await act(async () => {});
  return view;
}

const state = () => useEditorStore.getState();
const blockIds = () => state().page.blocks.map((b) => b.id);
const title = (id: string) => {
  const block = state().page.blocks.find((b) => b.id === id);
  return block && 'title' in block.data ? block.data.title : undefined;
};
const sentBody = (call: number) => updatePage.mock.calls[call][1] as { version: number; blocks: Array<{ id: string; data: { title?: string } }> };

async function save() {
  let ok = false;
  await act(async () => { ok = await sync.saveToApi(); });
  return ok;
}

async function remoteChange(change: Partial<RemotePageChange> & { version: number }) {
  await act(async () => {
    sync.handleRemoteChange({ reason: 'save', by: null, connectionId: null, ...change });
  });
  // The save a merge may start is queued behind the merge
  await act(async () => {});
}

describe('usePageSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useEditorStore.setState({
      past: [], future: [], selectedBlockId: null, syncBase: null, myConnectionId: null, presence: [], collabStatus: 'idle',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('loads the page, its version as sync base, and clears the previous history', async () => {
      useEditorStore.setState({ past: [state().page] });
      getPage.mockResolvedValue(apiPage({ version: 4 }));

      const view = await mount();

      expect(state().page.id).toBe(PAGE_ID);
      expect(state().past).toEqual([]);
      expect(state().syncBase?.version).toBe(4);
      view.unmount();
    });

    it('falls back to the backup of the same page, replacing legacy block ids', async () => {
      localStorage.setItem(`paxl-page-backup:${PAGE_ID}`, JSON.stringify({
        id: PAGE_ID, name: 'From backup', status: 'draft', slug: 'landing',
        blocks: [{ id: 'blk_legacy_1', type: 'hero', name: 'Hero', data: {}, styles: {} }],
      }));
      localStorage.setItem('paxl-page-backup:another-page', JSON.stringify({ id: 'another-page', blocks: [] }));
      getPage.mockRejectedValue(new Error('offline'));

      const view = await mount();

      const { page, syncBase } = state();
      expect(page.name).toBe('From backup');
      expect(page.blocks[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(syncBase).toBeNull();
      view.unmount();
    });

    it('reports the HTTP status of a failed load, not only its message', async () => {
      getPage.mockRejectedValue(new ApiError(404, '{"error":"Not found"}'));

      const view = await mount();

      expect(sync.errorStatus).toBe(404);
      view.unmount();
    });

    it('has no status when the failure was not an HTTP response', async () => {
      getPage.mockRejectedValue(new Error('offline'));

      const view = await mount();

      expect(sync.error).toBe('offline');
      expect(sync.errorStatus).toBeNull();
      view.unmount();
    });

    it('editing a backup learns the server version before sending it', async () => {
      localStorage.setItem(`paxl-page-backup:${PAGE_ID}`, JSON.stringify({
        ...apiPage(), name: 'From backup', designTokens: undefined, seo: undefined,
        blocks: [{ id: BLOCK_A, type: 'hero', name: 'Hero', data: { title: 'Offline edit' }, styles: {} }],
      }));
      getPage.mockRejectedValueOnce(new Error('offline'));
      const view = await mount();

      getPage.mockResolvedValue(apiPage({ version: 7 }));
      updatePage.mockImplementation(async (_id, body) => echo(body, 8));
      expect(await save()).toBe(true);

      expect(sentBody(0).version).toBe(7);
      expect(sentBody(0).blocks[0].data.title).toBe('Offline edit');
      view.unmount();
    });
  });

  describe('saving', () => {
    it('sends the base version and the connection id, then moves the base forward', async () => {
      getPage.mockResolvedValue(apiPage({ version: 3 }));
      const view = await mount();
      useEditorStore.setState({ myConnectionId: 'conn-me' });
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Edited'); });
      updatePage.mockImplementation(async (_id, body) => echo(body, 4));

      expect(await save()).toBe(true);

      expect(sentBody(0).version).toBe(3);
      expect(updatePage.mock.calls[0][2]).toBe('conn-me');
      expect(state().syncBase?.version).toBe(4);
      expect(state().isSaved).toBe(true);
      view.unmount();
    });

    it('does not send anything when nothing changed since the last known server state', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();

      expect(await save()).toBe(true);

      expect(updatePage).not.toHaveBeenCalled();
      view.unmount();
    });

    it('keeps local block ids when a block is added while a save is in flight', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Edited'); });

      let respond: (page: ApiPage) => void = () => {};
      updatePage.mockReturnValue(new Promise((resolve) => { respond = resolve; }));

      let saving!: Promise<boolean>;
      act(() => { saving = sync.saveToApi(); });
      await act(async () => {});
      // While the request is in flight the user adds a block at the top
      act(() => { state().addBlock('features', 'Features', 0, { title: 'New' }); });
      const idsBeforeResponse = blockIds();

      await act(async () => {
        respond(apiPage({ version: 2, blocks: apiBlocks({ a: 'Edited' }) }));
        await saving;
      });

      expect(blockIds()).toEqual(idsBeforeResponse);
      expect(state().isSaved).toBe(false);
      view.unmount();
    });

    it('keeps one PUT in flight; saves asked meanwhile share one follow-up based on the new version', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'First'); });

      const responders: Array<() => void> = [];
      updatePage.mockImplementation((_id, body) => new Promise((resolve) => {
        const version = (body as { version: number }).version + 1;
        responders.push(() => resolve(echo(body, version)));
      }));

      let first!: Promise<boolean>;
      act(() => { first = sync.saveToApi(); });
      await act(async () => {});
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Second'); });
      let second!: Promise<boolean>;
      let third!: Promise<boolean>;
      act(() => {
        second = sync.saveToApi();
        third = sync.saveToApi();
      });
      await act(async () => {});
      expect(updatePage).toHaveBeenCalledTimes(1);

      await act(async () => { responders[0](); await first; });
      await act(async () => {});
      expect(updatePage).toHaveBeenCalledTimes(2);
      expect(sentBody(1).version).toBe(2);
      expect(sentBody(1).blocks[0].data.title).toBe('Second');

      await act(async () => { responders[1](); await Promise.all([second, third]); });
      expect(updatePage).toHaveBeenCalledTimes(2);
      expect(state().syncBase?.version).toBe(3);
      view.unmount();
    });

    it('stores the backup and reports a failed request', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Unsaved'); });
      updatePage.mockRejectedValue(new ApiError(500, 'boom'));

      expect(await save()).toBe(false);

      expect(onSaveFailed).toHaveBeenCalledWith('request', expect.any(ApiError));
      expect(localStorage.getItem(`paxl-page-backup:${PAGE_ID}`)).toContain('Unsaved');
      expect(state().saveIssue).toEqual({ kind: 'failed', error: 'server', retrying: true });
      expect(state().autoSaveStatus).toBe('error');
      view.unmount();
    });
  });

  describe('409 conflicts', () => {
    it('merges the server page with local edits and saves again on its version', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => {
        state().selectBlock(BLOCK_A);
        state().updateBlock(BLOCK_A, 'title', 'Mine');
      });
      const pastBefore = state().past.length;
      const theirs = apiPage({ version: 2, blocks: apiBlocks({ b: 'Theirs' }) });
      updatePage
        .mockRejectedValueOnce(conflict(theirs))
        .mockImplementation(async (_id, body) => echo(body, 3));

      expect(await save()).toBe(true);

      expect(updatePage).toHaveBeenCalledTimes(2);
      expect(sentBody(1).version).toBe(2);
      expect(sentBody(1).blocks.map((b) => b.data.title)).toEqual(['Mine', 'Theirs']);
      expect(title(BLOCK_A)).toBe('Mine');
      expect(title(BLOCK_B)).toBe('Theirs');
      expect(state().past.length).toBe(pastBefore); // the merge is not an undo step
      expect(state().selectedBlockId).toBe(BLOCK_A);
      expect(state().syncBase?.version).toBe(3);
      view.unmount();
    });

    it('does not save again when the server already has the same change', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Same'); });
      updatePage.mockRejectedValueOnce(conflict(apiPage({ version: 2, blocks: apiBlocks({ a: 'Same' }) })));

      expect(await save()).toBe(true);

      expect(updatePage).toHaveBeenCalledTimes(1);
      expect(state().syncBase?.version).toBe(2);
      view.unmount();
    });

    it('drops the selection when the selected block was deleted remotely', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => {
        state().selectBlock(BLOCK_B);
        state().updateBlock(BLOCK_A, 'title', 'Mine');
      });
      const withoutB = apiPage({ version: 2, blocks: apiBlocks().slice(0, 1) });
      updatePage
        .mockRejectedValueOnce(conflict(withoutB))
        .mockImplementation(async (_id, body) => echo(body, 3));

      await save();

      expect(blockIds()).toEqual([BLOCK_A]);
      expect(state().selectedBlockId).toBeNull();
      view.unmount();
    });

    it(`gives up after ${MAX_CONFLICT_RETRIES} merges and reports the conflict`, async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Mine'); });
      let version = 1;
      updatePage.mockImplementation(async () => {
        version += 1;
        throw conflict(apiPage({ version, blocks: apiBlocks({ b: `Theirs ${version}` }) }));
      });

      expect(await save()).toBe(false);

      expect(updatePage).toHaveBeenCalledTimes(MAX_CONFLICT_RETRIES + 1);
      expect(onSaveFailed).toHaveBeenCalledWith('conflict', null);
      expect(title(BLOCK_A)).toBe('Mine'); // the local edit is still there for the next try
      view.unmount();
    });

    it('undoing a local edit after a merge keeps the other person\'s change', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Mine'); });
      updatePage
        .mockRejectedValueOnce(conflict(apiPage({ version: 2, blocks: apiBlocks({ b: 'Theirs' }) })))
        .mockImplementation(async (_id, body) => echo(body, 3));
      await save();

      act(() => { state().undo(); });

      expect(title(BLOCK_A)).toBe('A');
      expect(title(BLOCK_B)).toBe('Theirs');
      view.unmount();
    });
  });

  describe('changes announced by the socket', () => {
    it('page_updated: fetches, merges with unsaved edits and saves them on the new version', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Unsaved mine'); });
      getPage.mockResolvedValue(apiPage({ version: 2, blocks: apiBlocks({ b: 'Theirs' }) }));
      updatePage.mockImplementation(async (_id, body) => echo(body, 3));

      await remoteChange({ version: 2, by: { userId: 'u2', username: 'ana' }, connectionId: 'conn-ana' });

      expect(title(BLOCK_A)).toBe('Unsaved mine');
      expect(title(BLOCK_B)).toBe('Theirs');
      expect(onRemoteMerged).toHaveBeenCalledWith(expect.objectContaining({ version: 2, reason: 'save' }));
      expect(updatePage).toHaveBeenCalledTimes(1);
      expect(sentBody(0).version).toBe(2);
      view.unmount();
    });

    it('page_updated without local edits only takes the remote page', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      getPage.mockResolvedValue(apiPage({ version: 2, name: 'Renamed', blocks: apiBlocks({ b: 'Theirs' }) }));

      await remoteChange({ version: 2 });

      expect(state().page.name).toBe('Renamed');
      expect(title(BLOCK_B)).toBe('Theirs');
      expect(updatePage).not.toHaveBeenCalled();
      view.unmount();
    });

    it('ignores its own echo and versions it already has', async () => {
      getPage.mockResolvedValue(apiPage({ version: 5 }));
      const view = await mount();
      useEditorStore.setState({ myConnectionId: 'conn-me' });
      getPage.mockClear();

      await remoteChange({ version: 6, connectionId: 'conn-me' });
      await remoteChange({ version: 5, connectionId: 'conn-other' });

      expect(getPage).not.toHaveBeenCalled();
      view.unmount();
    });

    it('after a reconnect, resyncs only when the server is at another version', async () => {
      getPage.mockResolvedValue(apiPage({ version: 5 }));
      const view = await mount();
      getPage.mockClear();

      await remoteChange({ version: 5, reason: 'reconnect' });
      expect(getPage).not.toHaveBeenCalled();

      getPage.mockResolvedValue(apiPage({ version: 9, blocks: apiBlocks({ a: 'Changed while away' }) }));
      await remoteChange({ version: 9, reason: 'reconnect' });
      expect(title(BLOCK_A)).toBe('Changed while away');
      expect(state().syncBase?.version).toBe(9);
      view.unmount();
    });

    it('a restore by someone else goes through the same merge and is reported', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateSeo('seoTitle', 'My unsaved title'); });
      getPage.mockResolvedValue(apiPage({
        version: 2,
        design_tokens: tokensToApi(presetTokens('ember')),
        blocks: [{ id: BLOCK_C, type: 'cta', order: 0, data: { title: 'Restored' }, styles: {} }] as unknown as ApiBlocks,
      }));
      updatePage.mockImplementation(async (_id, body) => echo(body, 3));

      await remoteChange({ version: 2, reason: 'restore', by: { userId: 'u2', username: 'ana' } });

      expect(blockIds()).toEqual([BLOCK_C]);
      expect(state().page.designTokens).toEqual(presetTokens('ember'));
      expect(state().page.seo.seoTitle).toBe('My unsaved title');
      expect(onRemoteMerged).toHaveBeenCalledWith(expect.objectContaining({ reason: 'restore', by: { userId: 'u2', username: 'ana' } }));
      view.unmount();
    });
  });

  describe('after access is revoked', () => {
    it('sends and fetches nothing once the owner stopped sharing the page', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Unsaved mine'); });
      act(() => { state().setCollabStatus('revoked'); });
      getPage.mockClear();

      expect(await save()).toBe(false);
      await remoteChange({ version: 2 });

      expect(updatePage).not.toHaveBeenCalled();
      expect(getPage).not.toHaveBeenCalled();
      expect(title(BLOCK_A)).toBe('Unsaved mine');
      view.unmount();
    });
  });

  describe('restore and publish', () => {
    it('restoring a version takes the restored page as is, with its version', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      useEditorStore.setState({ myConnectionId: 'conn-me' });
      act(() => { state().updateSeo('seoTitle', 'Local title'); });
      restoreVersion.mockResolvedValue(apiPage({
        version: 6, design_tokens: tokensToApi(presetTokens('ember')), seo_title: 'Restored title',
      }));

      await act(async () => { await sync.restoreVersion('version-1'); });

      const { page, past, syncBase } = state();
      expect(restoreVersion).toHaveBeenCalledWith(PAGE_ID, 'version-1', true, 'conn-me');
      expect(page.designTokens).toEqual(presetTokens('ember'));
      expect(page.seo?.seoTitle).toBe('Restored title');
      expect(past).toEqual([]);
      expect(syncBase?.version).toBe(6);
      view.unmount();
    });

    it('publish saves the draft first, then freezes it', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Lista para publicar'); });
      updatePage.mockImplementation(async (_id, body) => echo({ ...body, has_unpublished_changes: false }, 2));
      publishPage.mockResolvedValue(apiPage({
        version: 3, blocks: apiBlocks({ a: 'Lista para publicar' }),
        status: 'published', published_at: '2026-10-09T10:00:00Z', has_unpublished_changes: false,
      }));
      const pastBefore = state().past.length;

      let ok = false;
      await act(async () => { ok = await sync.publishToApi(); });

      expect(ok).toBe(true);
      expect(updatePage.mock.invocationCallOrder[0]).toBeLessThan(publishPage.mock.invocationCallOrder[0]);
      const { page, past, syncBase } = state();
      expect(page.status).toBe('published');
      expect(page.hasUnpublishedChanges).toBe(false);
      expect(past.length).toBe(pastBefore); // status change is not an undo step
      expect(syncBase?.version).toBe(3);
      expect(updatePage).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    it('does not publish when saving the draft fails', async () => {
      getPage.mockResolvedValue(apiPage());
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Edited'); });
      updatePage.mockRejectedValue(new Error('API 500'));

      let ok = true;
      await act(async () => { ok = await sync.publishToApi(); });

      expect(ok).toBe(false);
      expect(publishPage).not.toHaveBeenCalled();
      view.unmount();
    });

    it('marks unpublished changes after saving a published page', async () => {
      getPage.mockResolvedValue(apiPage({ status: 'published', has_unpublished_changes: false }));
      const view = await mount();
      act(() => { state().updateBlock(BLOCK_A, 'title', 'Editado'); });
      updatePage.mockImplementation(async (_id, body) => echo({ ...body, status: 'published', has_unpublished_changes: true }, 2));

      await save();

      expect(state().page.hasUnpublishedChanges).toBe(true);
      view.unmount();
    });
  });
});

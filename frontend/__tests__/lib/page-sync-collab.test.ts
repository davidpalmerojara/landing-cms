/**
 * PageSyncController with other people on the page: relayed live text is not
 * saved as ours (QA-033), undo never brings back a block someone else deleted
 * (QA-034), and a restore that keeps block ids merges without duplicates (QA-012).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiPage } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { PageSyncController } from '@/lib/page-sync';
import { getAtPath } from '@/lib/block-data';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      pages: { get: vi.fn(), update: vi.fn(), create: vi.fn(), publish: vi.fn() },
      versions: { restore: vi.fn() },
    },
  };
});

const { api } = await import('@/lib/api');
const getPage = vi.mocked(api.pages.get);
const updatePage = vi.mocked(api.pages.update);

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOOTER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ana = { connectionId: 'conn-ana', userId: 'u-ana', username: 'Ana' };

type ApiBlocks = ApiPage['blocks'];
type Titles = Partial<Record<typeof HERO | typeof CTA | typeof FOOTER, string>>;

/** The page on the server: blocks in this order with these titles. */
function apiPage(version: number, titles: Titles): ApiPage {
  const types: Record<string, string> = { [HERO]: 'hero', [CTA]: 'cta', [FOOTER]: 'cta' };
  return {
    id: PAGE_ID,
    version,
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
    blocks: Object.entries(titles).map(([id, title], order) => ({ id, type: types[id], order, data: { title }, styles: {} })) as unknown as ApiBlocks,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  } as ApiPage;
}

const state = () => useEditorStore.getState();
const ids = () => state().page.blocks.map((b) => b.id);
const title = (id: string) => getAtPath(state().page.blocks.find((b) => b.id === id)?.data ?? {}, ['title']);
const sentTitles = (call: number) => {
  const body = updatePage.mock.calls[call][1] as { blocks: Array<{ id: string; data: { title?: string } }> };
  return Object.fromEntries(body.blocks.map((b) => [b.id, b.data.title]));
};
/** Let queued microtasks (the remote-update flag, a save queued after a merge) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function load(page: ApiPage): Promise<PageSyncController> {
  const sync = new PageSyncController(PAGE_ID);
  await sync.load(async () => page);
  await settle();
  return sync;
}

describe('PageSyncController with collaborators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useEditorStore.setState({
      past: [], future: [], selectedBlockId: null, syncBase: null, myConnectionId: 'conn-me', myUserId: 'u-me',
      presence: [], blockLocks: {}, relayedEdits: {}, collabStatus: 'connected',
    });
    updatePage.mockImplementation(async (_id, body) => ({ ...apiPage(0, {}), ...(body as Partial<ApiPage>), version: (body as { version: number }).version + 1 }));
  });

  it('QA-033: saving my edit of one block sends the server value of a block someone is typing in', async () => {
    const sync = await load(apiPage(1, { [HERO]: 'H0', [CTA]: 'C0' }));
    useEditorStore.setState({ blockLocks: { [CTA]: ana } });
    state().applyRemoteBlockUpdate(CTA, { title: 'C0 GHOST' }, undefined, ana.connectionId);
    state().updateBlock(HERO, 'title', 'H1');

    expect(await sync.save()).toBe(true);

    expect(sentTitles(0)).toEqual({ [HERO]: 'H1', [CTA]: 'C0' });
    // Ana's text stays on screen while she has the block
    expect(title(CTA)).toBe('C0 GHOST');
  });

  it('QA-033: with only relayed text on screen there is nothing to save', async () => {
    const sync = await load(apiPage(1, { [HERO]: 'H0', [CTA]: 'C0' }));
    state().applyRemoteBlockUpdate(CTA, { title: 'C0 GHOST' }, undefined, ana.connectionId);

    expect(await sync.save()).toBe(true);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('QA-033: once the holder saves and lets go, the page shows what the server has', async () => {
    const sync = await load(apiPage(1, { [HERO]: 'H0', [CTA]: 'C0' }));
    useEditorStore.setState({ blockLocks: { [CTA]: ana } });
    state().applyRemoteBlockUpdate(CTA, { title: 'C0 typed' }, undefined, ana.connectionId);
    useEditorStore.setState({ blockLocks: {} });

    getPage.mockResolvedValue(apiPage(2, { [HERO]: 'H0', [CTA]: 'C0 saved' }));
    await sync.handleRemoteChange({ version: 2, reason: 'save', by: null, connectionId: ana.connectionId });
    await settle();

    expect(title(CTA)).toBe('C0 saved');
    expect(state().relayedEdits).toEqual({});
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('QA-034: undo does not resurrect a block someone else deleted, and still reverts my other edit', async () => {
    const sync = await load(apiPage(1, { [HERO]: 'H0', [CTA]: 'C0', [FOOTER]: 'F0' }));
    state().updateBlock(CTA, 'title', 'C1');
    state().updateBlock(HERO, 'title', 'H1');
    await sync.save();
    // Someone deletes the hero
    getPage.mockResolvedValue(apiPage(3, { [CTA]: 'C1', [FOOTER]: 'F0' }));
    await sync.handleRemoteChange({ version: 3, reason: 'save', by: null, connectionId: ana.connectionId });
    await settle();
    expect(ids()).toEqual([CTA, FOOTER]);

    state().undo(); // my hero edit: the hero is gone, nothing comes back
    expect(ids()).toEqual([CTA, FOOTER]);
    state().undo(); // my CTA edit
    expect(title(CTA)).toBe('C0');

    expect(await sync.save()).toBe(true);
    expect(Object.keys(sentTitles(updatePage.mock.calls.length - 1))).toEqual([CTA, FOOTER]);
  });

  it('QA-012: a restore that keeps block ids merges into one block, with my unsaved edit', async () => {
    const sync = await load(apiPage(1, { [HERO]: 'H1', [CTA]: 'C1', [FOOTER]: 'F1' }));
    state().updateBlock(FOOTER, 'title', 'F-UNSAVED');
    // The restored version: the same ids, older content, the hero not in it
    getPage.mockResolvedValue(apiPage(2, { [CTA]: 'C0', [FOOTER]: 'F0' }));

    await sync.handleRemoteChange({ version: 2, reason: 'restore', by: null, connectionId: ana.connectionId });
    await settle();

    expect(ids()).toEqual([CTA, FOOTER]);
    expect(title(CTA)).toBe('C0');
    expect(title(FOOTER)).toBe('F-UNSAVED');
  });
});

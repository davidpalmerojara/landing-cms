/**
 * MOBILE2-002: an AI block edit is written by the server, which bumps the page
 * version. The editor takes that block and version as its sync base, so the
 * next save (undoing the AI edit included) is not a 409 and the undo sticks.
 * Own file: the controller registers itself as the tab's active one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/lib/api';
import type { ApiPage } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { PageSyncController, adoptServerBlock } from '@/lib/page-sync';
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

/** A tiny server: it refuses a PUT whose version is not its own (409 with its page), like the API. */
const server = { version: 1, titles: { [HERO]: 'Before', [CTA]: 'C0' } as Record<string, string> };

function apiPage(): ApiPage {
  const types: Record<string, string> = { [HERO]: 'hero', [CTA]: 'cta' };
  return {
    id: PAGE_ID,
    version: server.version,
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
    blocks: Object.entries(server.titles).map(([id, title], order) => ({ id, type: types[id], order, data: { title }, styles: {} })),
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  } as unknown as ApiPage;
}

/** The server's AI endpoint: writes the block and bumps the version. */
function serverAiEdit(title: string) {
  server.titles = { ...server.titles, [HERO]: title };
  server.version += 1;
  return { id: HERO, type: 'hero', data: { title } };
}

const state = () => useEditorStore.getState();
const title = (id: string) => getAtPath(state().page.blocks.find((b) => b.id === id)?.data ?? {}, ['title']);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let sync: PageSyncController;

describe('PageSyncController after an AI block edit (MOBILE2-002)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    server.version = 1;
    server.titles = { [HERO]: 'Before', [CTA]: 'C0' };
    useEditorStore.setState({
      past: [], future: [], selectedBlockId: null, syncBase: null, myConnectionId: 'conn-me', myUserId: 'u-me',
      presence: [], blockLocks: {}, relayedEdits: {}, collabStatus: 'connected',
    });
    getPage.mockImplementation(async () => apiPage());
    updatePage.mockImplementation(async (_id, body) => {
      const sent = body as { version: number; blocks: Array<{ id: string; data: { title: string } }> };
      if (sent.version !== server.version) {
        throw new ApiError(409, JSON.stringify({ error: 'stale', code: 'VERSION_CONFLICT', page: apiPage() }));
      }
      server.titles = Object.fromEntries(sent.blocks.map((b) => [b.id, b.data.title]));
      server.version += 1;
      return apiPage();
    });
    sync = new PageSyncController(PAGE_ID);
    sync.start();
    await sync.load(() => getPage(PAGE_ID));
    await settle();
  });

  afterEach(() => {
    sync.dispose();
  });

  it('takes the block and the reported version as the base: nothing is left to save', async () => {
    const block = serverAiEdit('AI text');

    expect(adoptServerBlock({ block, pageVersion: server.version })).toBe(true);

    expect(title(HERO)).toBe('AI text');
    expect(state().syncBase?.version).toBe(2);
    expect(sync.hasUnsavedChanges()).toBe(false);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it('undoing the AI edit saves the old text with the new version, without a 409', async () => {
    adoptServerBlock({ block: serverAiEdit('AI text'), pageVersion: server.version });
    state().undo();
    expect(title(HERO)).toBe('Before');

    expect(await sync.save()).toBe(true);

    expect(updatePage).toHaveBeenCalledTimes(1);
    expect((updatePage.mock.calls[0][1] as { version: number }).version).toBe(2);
    expect(server.titles[HERO]).toBe('Before');
    expect(title(HERO)).toBe('Before');
    expect(state().autoSaveStatus).toBe('saved');
  });

  it('without the version in the response: fetches the page, and undo still sticks', async () => {
    adoptServerBlock({ block: serverAiEdit('AI text'), pageVersion: null });
    await settle();
    await sync.save();
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(state().syncBase?.version).toBe(2);
    expect(updatePage).not.toHaveBeenCalled();

    state().undo();
    expect(await sync.save()).toBe(true);

    expect(updatePage).toHaveBeenCalledTimes(1);
    expect(server.titles[HERO]).toBe('Before');
    expect(title(HERO)).toBe('Before');
  });

  it('when someone saved in between, merges their change and keeps the undo step', async () => {
    // Someone else changed the CTA (v2), then the AI wrote the hero (v3)
    server.titles = { ...server.titles, [CTA]: 'C1 by Ana' };
    server.version += 1;
    adoptServerBlock({ block: serverAiEdit('AI text'), pageVersion: server.version });
    await settle();
    await sync.save();

    expect(title(CTA)).toBe('C1 by Ana');
    expect(title(HERO)).toBe('AI text');
    expect(state().syncBase?.version).toBe(3);

    state().undo();
    expect(await sync.save()).toBe(true);
    expect(server.titles).toEqual({ [HERO]: 'Before', [CTA]: 'C1 by Ana' });
  });

  it('a block type this editor does not know changes nothing', () => {
    expect(adoptServerBlock({ block: { id: HERO, type: 'mystery', data: {} }, pageVersion: 2 })).toBe(false);
    expect(state().syncBase?.version).toBe(1);
    expect(title(HERO)).toBe('Before');
  });
});

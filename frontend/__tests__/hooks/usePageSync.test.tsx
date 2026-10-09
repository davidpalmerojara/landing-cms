import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import type { ApiPage } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { usePageSync } from '@/hooks/usePageSync';
import { render } from '../mobile-editor/test-utils';

vi.mock('@/lib/api', () => ({
  api: {
    pages: {
      get: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      publish: vi.fn(),
    },
  },
}));

const { api } = await import('@/lib/api');
const getPage = vi.mocked(api.pages.get);
const updatePage = vi.mocked(api.pages.update);
const publishPage = vi.mocked(api.pages.publish);

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const BLOCK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function apiPage(overrides: Partial<ApiPage> = {}): ApiPage {
  return {
    id: PAGE_ID,
    name: 'Landing',
    slug: 'landing',
    status: 'draft',
    theme_id: 'dark',
    custom_theme: {},
    design_tokens: {},
    seo_title: '',
    seo_description: '',
    seo_canonical_url: '',
    og_title: '',
    og_description: '',
    og_image: '',
    og_type: 'website',
    noindex: false,
    blocks: [
      { id: BLOCK_A, type: 'hero', order: 0, data: { title: 'A' }, styles: {} },
      { id: BLOCK_B, type: 'cta', order: 1, data: { title: 'B' }, styles: {} },
    ],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as ApiPage;
}

type Sync = ReturnType<typeof usePageSync>;
let sync: Sync;
function Harness({ pageId, onSync }: { pageId: string; onSync: (s: Sync) => void }) {
  const result = usePageSync(pageId);
  useEffect(() => onSync(result));
  return null;
}

async function mount(pageId = PAGE_ID) {
  const view = render(<Harness pageId={pageId} onSync={(s) => { sync = s; }} />);
  await act(async () => {});
  return view;
}

const blockIds = () => useEditorStore.getState().page.blocks.map((b) => b.id);

describe('usePageSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useEditorStore.setState({ past: [], future: [], selectedBlockId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the page and clears any history from the previous page', async () => {
    useEditorStore.setState({ past: [useEditorStore.getState().page] });
    getPage.mockResolvedValue(apiPage());

    const view = await mount();

    expect(useEditorStore.getState().page.id).toBe(PAGE_ID);
    expect(useEditorStore.getState().past).toEqual([]);
    view.unmount();
  });

  it('keeps local block ids when a block is added while a save is in flight', async () => {
    getPage.mockResolvedValue(apiPage());
    const view = await mount();

    let respond: (page: ApiPage) => void = () => {};
    updatePage.mockReturnValue(new Promise((resolve) => { respond = resolve; }));

    let saving!: Promise<boolean>;
    act(() => { saving = sync.saveToApi(); });
    // While the request is in flight the user adds a block at the top
    act(() => { useEditorStore.getState().addBlock('features', 'Features', 0, { title: 'New' }); });
    const idsBeforeResponse = blockIds();

    // The server answers with its own view (different order than local state)
    await act(async () => {
      respond(apiPage({ blocks: [...apiPage().blocks].reverse() }));
      await saving;
    });

    expect(blockIds()).toEqual(idsBeforeResponse);
    expect(useEditorStore.getState().isSaved).toBe(false);
    view.unmount();
  });

  it('marks the page as saved when nothing changed during the request', async () => {
    getPage.mockResolvedValue(apiPage());
    const view = await mount();
    act(() => { useEditorStore.getState().updateBlock(BLOCK_A, 'title', 'Edited'); });
    updatePage.mockResolvedValue(apiPage());

    await act(async () => { await sync.saveToApi(); });

    expect(useEditorStore.getState().isSaved).toBe(true);
    const sentBlocks = (updatePage.mock.calls[0][1] as { blocks: Array<{ id: string }> }).blocks;
    expect(sentBlocks.map((b) => b.id)).toEqual([BLOCK_A, BLOCK_B]);
    view.unmount();
  });

  it('falls back to the backup of the same page, replacing legacy block ids', async () => {
    localStorage.setItem(`paxl-page-backup:${PAGE_ID}`, JSON.stringify({
      id: PAGE_ID, name: 'From backup', status: 'draft', slug: 'landing', themeId: 'default',
      blocks: [{ id: 'blk_legacy_1', type: 'hero', name: 'Hero', data: {}, styles: {} }],
    }));
    localStorage.setItem('paxl-page-backup:another-page', JSON.stringify({ id: 'another-page', blocks: [] }));
    getPage.mockRejectedValue(new Error('offline'));

    const view = await mount();

    const { page } = useEditorStore.getState();
    expect(page.name).toBe('From backup');
    expect(page.blocks[0].id).toMatch(/^[0-9a-f-]{36}$/);
    view.unmount();
  });

  it('reloadFromApi takes theme, tokens and SEO from the server (version restore)', async () => {
    getPage.mockResolvedValue(apiPage());
    const view = await mount();
    act(() => { useEditorStore.getState().updateSeo('seoTitle', 'Local title'); });

    getPage.mockResolvedValue(apiPage({ theme_id: 'ember', seo_title: 'Restored title' }));
    await act(async () => { await sync.reloadFromApi(); });

    const { page, past } = useEditorStore.getState();
    expect(page.themeId).toBe('ember');
    expect(page.seo?.seoTitle).toBe('Restored title');
    expect(past).toEqual([]);
    view.unmount();
  });

  it('publish saves the draft first, then freezes it', async () => {
    getPage.mockResolvedValue(apiPage());
    const view = await mount();
    act(() => { useEditorStore.getState().updateBlock(BLOCK_A, 'title', 'Lista para publicar'); });
    updatePage.mockResolvedValue(apiPage({ has_unpublished_changes: false }));
    publishPage.mockResolvedValue(apiPage({ status: 'published', published_at: '2026-10-09T10:00:00Z', has_unpublished_changes: false }));
    const pastBefore = useEditorStore.getState().past.length;

    let ok = false;
    await act(async () => { ok = await sync.publishToApi(); });

    expect(ok).toBe(true);
    expect(updatePage.mock.invocationCallOrder[0]).toBeLessThan(publishPage.mock.invocationCallOrder[0]);
    const { page, past } = useEditorStore.getState();
    expect(page.status).toBe('published');
    expect(page.hasUnpublishedChanges).toBe(false);
    expect(past.length).toBe(pastBefore); // status change is not an undo step
    view.unmount();
  });

  it('does not publish when saving the draft fails', async () => {
    getPage.mockResolvedValue(apiPage());
    const view = await mount();
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
    act(() => { useEditorStore.getState().updateBlock(BLOCK_A, 'title', 'Editado'); });
    updatePage.mockResolvedValue(apiPage({ status: 'published', has_unpublished_changes: true }));

    await act(async () => { await sync.saveToApi(); });

    expect(useEditorStore.getState().page.hasUnpublishedChanges).toBe(true);
    view.unmount();
  });
});


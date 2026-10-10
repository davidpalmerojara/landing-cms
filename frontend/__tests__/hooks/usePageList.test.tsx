import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { api } from '@/lib/api';
import type { ApiPageListItem, PaginatedResponse } from '@/lib/api';
import { usePageList } from '@/hooks/usePageList';
import { render, type RenderResult } from '../mobile-editor/test-utils';

let latest: ReturnType<typeof usePageList>;
let view: RenderResult;

function Harness({ search }: { search: string }) {
  const result = usePageList(search);
  useEffect(() => {
    latest = result;
  });
  return null;
}

function item(id: string): ApiPageListItem {
  return { id, name: `Page ${id}`, slug: `page-${id}`, status: 'draft', block_count: 0, preview_blocks: [] } as unknown as ApiPageListItem;
}

function answer(ids: string[], count: number, next: string | null): PaginatedResponse<ApiPageListItem> {
  return { count, next, previous: null, results: ids.map(item) };
}

async function mount(search = '') {
  await act(async () => {
    view = render(<Harness search={search} />);
  });
}

beforeEach(() => {
  vi.spyOn(api.pages, 'list').mockImplementation(async ({ page = 1, search = '' } = {}) => {
    if (search === 'needle') return answer(['n1'], 1, null);
    return page === 1 ? answer(['1', '2'], 3, 'next-url') : answer(['3'], 3, null);
  });
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('usePageList', () => {
  it('QA-016: gives the first page, the total from the server and whether there are more', async () => {
    await mount();

    expect(latest.pages.map((p) => p.id)).toEqual(['1', '2']);
    expect(latest.count).toBe(3);
    expect(latest.hasMore).toBe(true);
    expect(latest.isLoading).toBe(false);
  });

  it('QA-016: loads the next page and adds it to the list', async () => {
    await mount();

    await act(async () => latest.loadMore());

    expect(api.pages.list).toHaveBeenLastCalledWith({ page: 2, search: '' });
    expect(latest.pages.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(latest.hasMore).toBe(false);
  });

  it('QA-016: searching asks the server, so it reaches pages that are not loaded', async () => {
    await mount('needle');

    expect(api.pages.list).toHaveBeenCalledWith({ page: 1, search: 'needle' });
    expect(latest.pages.map((p) => p.id)).toEqual(['n1']);
    expect(latest.count).toBe(1);
  });

  it('reloading fetches again every page already on screen, so the list does not collapse', async () => {
    await mount();
    await act(async () => latest.loadMore());
    vi.mocked(api.pages.list).mockClear();

    await act(async () => latest.reload());

    expect(vi.mocked(api.pages.list).mock.calls.map(([params]) => params?.page)).toEqual([1, 2]);
    expect(latest.pages.map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('QA-052: a failed load is an error with a retry, not an empty list', async () => {
    vi.mocked(api.pages.list).mockRejectedValueOnce(new Error('boom'));

    await mount();

    expect(latest.hasError).toBe(true);
    expect(latest.isLoading).toBe(false);
    expect(latest.pages).toEqual([]);

    await act(async () => latest.reload());

    expect(latest.hasError).toBe(false);
    expect(latest.pages.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('a page deleted locally leaves the list and the count', async () => {
    await mount();

    act(() => latest.updatePages((pages) => pages.filter((p) => p.id !== '1')));

    expect(latest.pages.map((p) => p.id)).toEqual(['2']);
    expect(latest.count).toBe(2);
  });
});

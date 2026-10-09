import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import SubmissionsPanel from '@/components/editor/SubmissionsPanel';
import { api } from '@/lib/api';
import type { ApiFormSubmission, PaginatedResponse } from '@/lib/api';
import { render, click, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

const submission: ApiFormSubmission = {
  id: 's1',
  block_id: null,
  name: 'Ana',
  email: 'ana@example.com',
  message: 'Hola\nsegunda línea',
  created_at: '2026-10-01T10:30:00Z',
};

function pageOf(results: ApiFormSubmission[]): PaginatedResponse<ApiFormSubmission> {
  return { count: results.length, next: null, previous: null, results };
}

async function renderPanel(): Promise<RenderResult> {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(<SubmissionsPanel pageId="page-123" />);
  });
  if (!view) throw new Error('not rendered');
  return view;
}

describe('SubmissionsPanel', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore();
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  it('shows an empty state when nobody has written yet', async () => {
    vi.spyOn(api.submissions, 'list').mockResolvedValue(pageOf([]));
    view = await renderPanel();
    expect(view.container.textContent).toContain('Todavía no hay mensajes');
    expect(view.container.querySelector('article')).toBeNull();
  });

  it('lists messages with a mailto link and the page id in the request', async () => {
    const list = vi.spyOn(api.submissions, 'list').mockResolvedValue(pageOf([submission]));
    view = await renderPanel();
    expect(list).toHaveBeenCalledWith('page-123', 1);

    const link = view.container.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(link?.getAttribute('href')).toBe('mailto:ana@example.com');
    expect(view.container.querySelector('article h2')?.textContent).toBe('Ana');
    expect(view.container.querySelector('article')?.textContent).toContain('segunda línea');
    expect(view.container.querySelector('time')?.getAttribute('datetime')).toBe(submission.created_at);
  });

  it('asks for confirmation before deleting, then reloads', async () => {
    const list = vi.spyOn(api.submissions, 'list')
      .mockResolvedValueOnce(pageOf([submission]))
      .mockResolvedValueOnce(pageOf([]));
    const remove = vi.spyOn(api.submissions, 'delete').mockResolvedValue(undefined);
    view = await renderPanel();

    const trash = view.container.querySelector<HTMLButtonElement>('button[aria-label="Eliminar el mensaje de Ana"]');
    expect(trash).not.toBeNull();
    click(trash!);
    expect(remove).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const confirm = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Eliminar');
    await act(async () => {
      confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(remove).toHaveBeenCalledWith('page-123', 's1');
    expect(list).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain('Todavía no hay mensajes');
  });

  it('reports a failed load with a retry button', async () => {
    vi.spyOn(api.submissions, 'list').mockRejectedValue(new Error('API 500'));
    view = await renderPanel();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se han podido cargar');
  });
});

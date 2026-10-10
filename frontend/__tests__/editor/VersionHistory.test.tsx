import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import VersionHistoryPanel from '@/components/editor/VersionHistoryPanel';
import { api, ApiError } from '@/lib/api';
import type { ApiPageVersion } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';
import { click, makePage, render, resetEditorStore, type RenderResult } from '../mobile-editor/test-utils';

function version(n: number, trigger: ApiPageVersion['trigger'] = 'manual'): ApiPageVersion {
  return {
    id: `v${n}`, version_number: n, trigger, label: `Versión ${n}`, created_by: 'u1',
    created_by_name: 'ana', size_bytes: 1200, created_at: new Date().toISOString(),
  };
}

const VERSIONS = [version(4), version(3, 'auto_publish'), version(2), version(1, 'auto_publish')];

let view: RenderResult;

async function openPanel(onRestore = vi.fn()) {
  await act(async () => {
    view = render(<VersionHistoryPanel pageId="page-123" onClose={vi.fn()} onPreview={vi.fn()} onRestore={onRestore} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const card = (n: number) => [...view.container.querySelectorAll('li')].find((li) => li.querySelector('h3')?.textContent === `v${n}`)!;
const named = (name: string) => view.container.querySelector<HTMLElement>(`[aria-label="${name}"]`);

beforeEach(() => {
  resetEditorStore(makePage([], { isOwner: true }));
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('version history (QA-047)', () => {
  it('a failed load says so and offers a retry, instead of "no saved versions"', async () => {
    const list = vi.spyOn(api.versions, 'list').mockRejectedValueOnce(new ApiError(500, '{"error":"boom"}'));
    await openPanel();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar el historial');
    expect(view.container.textContent).not.toContain('Sin versiones guardadas');

    list.mockResolvedValue({ count: 1, next: null, previous: null, results: [version(1)] });
    await act(async () => {
      [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'))!.click();
      await Promise.resolve();
    });
    expect(card(1)).toBeTruthy();
  });

  it('the actions show on keyboard focus and on touch screens, not only on hover', async () => {
    vi.spyOn(api.versions, 'list').mockResolvedValue({ count: 4, next: null, previous: null, results: VERSIONS });
    await openPanel();
    const actions = named('Restaurar la versión 4')!.parentElement!;
    expect(actions.className).toContain('group-focus-within:opacity-100');
    expect(actions.className).toContain('pointer-coarse:opacity-100');
  });

  it('every action has a name, and the rename field is labelled', async () => {
    vi.spyOn(api.versions, 'list').mockResolvedValue({ count: 4, next: null, previous: null, results: VERSIONS });
    await openPanel();
    for (const name of ['Previsualizar la versión 4', 'Restaurar la versión 4', 'Editar la etiqueta de la versión 4', 'Eliminar la versión 4']) {
      expect(named(name), name).not.toBeNull();
    }
    click(named('Editar la etiqueta de la versión 4')!);
    expect(view.container.querySelector('input')?.getAttribute('aria-label')).toBe('Etiqueta de la versión 4');
  });

  it('restore and delete ask in the app dialog, not with the browser confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const remove = vi.spyOn(api.versions, 'delete').mockResolvedValue(undefined);
    const onRestore = vi.fn();
    vi.spyOn(api.versions, 'list').mockResolvedValue({ count: 4, next: null, previous: null, results: VERSIONS });
    await openPanel(onRestore);

    click(named('Restaurar la versión 2')!);
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('¿Restaurar la versión 2?');
    click([...document.body.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Restaurar')!);
    expect(onRestore).toHaveBeenCalledWith('v2');

    click(named('Eliminar la versión 2')!);
    await act(async () => {
      ([...document.body.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Eliminar') as HTMLElement).click();
      await Promise.resolve();
    });
    expect(remove).toHaveBeenCalledWith('page-123', 'v2');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('QA-013: the published version (the newest publish) cannot be deleted from the panel; older publishes can', async () => {
    vi.spyOn(api.versions, 'list').mockResolvedValue({ count: 4, next: null, previous: null, results: VERSIONS });
    await openPanel();
    expect(named('Eliminar la versión 3')).toBeNull();
    expect(card(3).textContent).toContain('Publicada');
    expect(named('Eliminar la versión 1')).not.toBeNull();
  });

  it('collaborators get no delete action (owner-only, ADR-032)', async () => {
    useEditorStore.setState((s) => ({ page: { ...s.page, isOwner: false } }));
    vi.spyOn(api.versions, 'list').mockResolvedValue({ count: 4, next: null, previous: null, results: VERSIONS });
    await openPanel();
    expect(named('Eliminar la versión 4')).toBeNull();
    expect(named('Restaurar la versión 4')).not.toBeNull();
  });

  it('QA-086: says how many versions the plan keeps', async () => {
    vi.spyOn(api.versions, 'list').mockResolvedValue({
      count: 4, next: null, previous: null, results: VERSIONS, max_versions: 5,
    } as Awaited<ReturnType<typeof api.versions.list>>);
    await openPanel();
    expect(view.container.textContent).toContain('Tu plan guarda las últimas 5 versiones');
  });
});

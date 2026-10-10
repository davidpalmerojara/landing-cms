import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import TopBar from '@/components/editor/TopBar';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import type { ApiPageVersion } from '@/lib/api';
import { registerSaveFlush } from '@/lib/save-flush';
import type { SaveIssue } from '@/lib/page-sync';
import { buttonByText, typeInto } from '../guest/test-helpers';
import { click, makeBlock, makePage, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// Preferences need the app providers; they are not what these tests are about
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/ui/ThemeToggle', () => ({ default: () => null }));

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface Props {
  onSave?: () => Promise<boolean>;
  onPublish?: () => Promise<boolean>;
  onUnpublish?: () => Promise<boolean>;
}

function renderTopBar(props: Props = {}, locale: 'es' | 'en' = 'es'): RenderResult {
  return render(
    <TopBar
      onSave={props.onSave ?? vi.fn().mockResolvedValue(true)}
      onPublish={props.onPublish ?? vi.fn().mockResolvedValue(true)}
      onUnpublish={props.onUnpublish}
      onViewChange={() => undefined}
    />,
    locale,
  );
}

const statusRegion = (view: RenderResult) => view.container.querySelector('[role="status"]') as HTMLElement;
const buttonNamed = (view: RenderResult, name: string) =>
  view.container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('TopBar', () => {
  let view: RenderResult;

  beforeEach(() => {
    push.mockClear();
    resetEditorStore(makePage([makeBlock('hero', { title: 'Hola' }, { id: HERO })], { id: PAGE_ID, slug: 'mi-landing' }));
  });

  afterEach(() => {
    view?.unmount();
    vi.restoreAllMocks();
  });

  describe('save status (QA-004)', () => {
    const showIssue = (issue: SaveIssue) => act(() => {
      useEditorStore.setState({ autoSaveStatus: 'error', saveIssue: issue });
    });

    it('says "Sin conexión" only when the server could not be reached', () => {
      view = renderTopBar();
      showIssue({ kind: 'failed', error: 'offline', retrying: true });
      expect(statusRegion(view).textContent).toContain('Sin conexión');

      showIssue({ kind: 'failed', error: 'notFound', retrying: false });
      expect(statusRegion(view).textContent).not.toContain('Sin conexión');
      expect(statusRegion(view).textContent).toContain('La página ya no existe');
    });

    it('names the refused field, its block and the rule, in the interface language', () => {
      view = renderTopBar({}, 'en');
      showIssue({
        kind: 'rejected',
        fields: [{
          blockId: HERO, blockType: 'hero', path: ['buttonLink'], value: 'example',
          message: 'Enlace no permitido. Usa https://, http://, mailto:, tel:, una ruta que empiece por / o un ancla #.',
        }],
      });

      const text = statusRegion(view).textContent ?? '';
      expect(text).toContain('Hero');
      expect(text).toContain('Button link');
      expect(text).toContain('Invalid link');
      expect(text).not.toContain('Enlace no permitido');
    });

    it('shows nothing wrong while saving or after a save', () => {
      view = renderTopBar();
      act(() => { useEditorStore.setState({ autoSaveStatus: 'saved', saveIssue: null }); });
      expect(statusRegion(view).textContent).toContain('Guardado');
    });
  });

  describe('publishing is the owner\'s (QA-023, D1)', () => {
    it('a collaborator sees why Publish does nothing, and nothing is sent', () => {
      act(() => { useEditorStore.setState((s) => ({ page: { ...s.page, isOwner: false } })); });
      const onPublish = vi.fn().mockResolvedValue(true);
      view = renderTopBar({ onPublish });

      const publish = buttonByText(view.container, 'Publicar');
      expect(publish.getAttribute('aria-disabled')).toBe('true');
      const note = document.getElementById(publish.getAttribute('aria-describedby') ?? '');
      expect(note?.textContent).toBe('Solo el propietario de la página puede publicarla o despublicarla.');

      click(publish);
      expect(onPublish).not.toHaveBeenCalled();
      expect(useEditorStore.getState().toasts.map((t) => t.message)).toContain(note?.textContent);
    });

    it('the owner can publish', () => {
      act(() => { useEditorStore.setState((s) => ({ page: { ...s.page, isOwner: true } })); });
      view = renderTopBar();
      expect(buttonByText(view.container, 'Publicar').getAttribute('aria-disabled')).toBeNull();
    });
  });

  describe('publish and unpublish (QA-098)', () => {
    it('after publishing, links to the public page', async () => {
      view = renderTopBar();

      await act(async () => { click(buttonByText(view.container, 'Publicar')); });

      const link = view.container.querySelector<HTMLAnchorElement>('a[href="/p/mi-landing"]');
      expect(link).not.toBeNull();
      expect(link?.target).toBe('_blank');
    });

    it('a published page can be unpublished from the publish menu, after confirming', async () => {
      act(() => { useEditorStore.setState((s) => ({ page: { ...s.page, status: 'published', isOwner: true } })); });
      const onUnpublish = vi.fn().mockResolvedValue(true);
      view = renderTopBar({ onUnpublish });

      click(buttonNamed(view, 'Más opciones de publicación')!);
      click(buttonByText(view.container, 'Despublicar'));
      expect(onUnpublish).not.toHaveBeenCalled();
      const dialog = view.container.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain('¿Despublicar la página?');
      await act(async () => { click(buttonByText(dialog, 'Despublicar')); });

      expect(onUnpublish).toHaveBeenCalledTimes(1);
      expect(useEditorStore.getState().toasts.map((t) => t.message)).toContain('Página despublicada');
    });
  });

  describe('editor views (QA-088)', () => {
    it('are toggle buttons in a named group, one pressed', () => {
      view = renderTopBar();
      const group = view.container.querySelector('[role="group"][aria-label="Vista del editor"]');
      const buttons = [...(group?.querySelectorAll('button') ?? [])];
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Diseño', 'Estilos', 'SEO', 'Analítica', 'Mensajes']);
      expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);
      expect(view.container.querySelector('[role="radio"]')).toBeNull();
    });
  });

  describe('saving first (QA-037, QA-003)', () => {
    it('"Guardar versión" waits for the pending save before copying the server page', async () => {
      const create = vi.spyOn(api.versions, 'create').mockResolvedValue({ version_number: 4 } as ApiPageVersion);
      const flush = deferred<boolean>();
      const unregister = registerSaveFlush(() => flush.promise);
      view = renderTopBar();

      click(buttonNamed(view, 'Guardar versión')!);
      click(buttonNamed(view, 'Confirmar versión')!);
      await act(async () => {});
      expect(create).not.toHaveBeenCalled();

      await act(async () => { flush.resolve(true); });
      expect(create).toHaveBeenCalledWith(PAGE_ID, '');
      unregister();
    });

    it('does not save a version of an old copy when the save failed', async () => {
      const create = vi.spyOn(api.versions, 'create');
      const unregister = registerSaveFlush(async () => false);
      view = renderTopBar();

      click(buttonNamed(view, 'Guardar versión')!);
      typeInto(view.container.querySelector('input[aria-label="Etiqueta (opcional)"]') as HTMLInputElement, 'v1');
      await act(async () => { click(buttonNamed(view, 'Confirmar versión')!); });

      expect(create).not.toHaveBeenCalled();
      expect(view.container.textContent).toContain('No se puede guardar la versión hasta que se guarden tus cambios.');
      unregister();
    });

    it('the logo saves before leaving for the dashboard', async () => {
      const flush = deferred<boolean>();
      const unregister = registerSaveFlush(() => flush.promise);
      view = renderTopBar();
      const logo = view.container.querySelector('a[href="/dashboard"]') as HTMLAnchorElement;

      click(logo);
      expect(push).not.toHaveBeenCalled();
      await act(async () => { flush.resolve(true); });

      expect(push).toHaveBeenCalledWith('/dashboard');
      unregister();
    });

    it('asks before leaving when the save failed', async () => {
      const unregister = registerSaveFlush(async () => false);
      view = renderTopBar();

      await act(async () => { click(view.container.querySelector('a[href="/dashboard"]') as HTMLAnchorElement); });

      expect(push).not.toHaveBeenCalled();
      const dialog = view.container.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.textContent).toContain('Hay cambios sin guardar');
      click(buttonByText(dialog, 'Salir igualmente'));
      expect(push).toHaveBeenCalledWith('/dashboard');
      unregister();
    });
  });
});

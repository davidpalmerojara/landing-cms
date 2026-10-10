/**
 * Quick Edit fixes from QA round 1 (batch 7): publishing after the first
 * publish, undo/redo, AI, images, sheets, locks, touch reorder and details.
 */
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import MobileBottomSheet from '@/components/mobile-editor/MobileBottomSheet';
import MobileBlockCard from '@/components/mobile-editor/MobileBlockCard';
import MobileBlockEditor from '@/components/mobile-editor/MobileBlockEditor';
import MobilePreview from '@/components/mobile-editor/MobilePreview';
import { themeSwatches } from '@/components/mobile-editor/MobileBlockStyles';
import GuestBanner from '@/components/guest/GuestBanner';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import { dropIndexAt, autoScrollSpeed, AUTO_SCROLL_EDGE } from '@/hooks/useTouchReorder';
import { useEditorStore } from '@/store/editor-store';
import type { PresenceEntry } from '@/store/editor-store';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { api } from '@/lib/api';
import * as blockI18n from '@/lib/block-i18n';
import { guestUser } from '../guest/test-helpers';
import {
  click,
  installMatchMedia,
  makeBlock,
  makePage,
  render,
  resetEditorStore,
  setNavigatorOnline,
  type RenderResult,
} from './test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const HERO = 'b-hero';
const FAQ = 'b-faq';

function blocks() {
  return [
    makeBlock('hero', { title: 'Hola', buttonLink: '' }, { id: HERO }),
    makeBlock('faq', { title: 'Preguntas' }, { id: FAQ }),
  ];
}

function renderEditor(overrides: Partial<Parameters<typeof MobileEditor>[0]> = {}): RenderResult & {
  onSave: ReturnType<typeof vi.fn>;
  onPublish: ReturnType<typeof vi.fn>;
  onUnpublish: ReturnType<typeof vi.fn>;
} {
  const onSave = vi.fn().mockResolvedValue(true);
  const onPublish = vi.fn().mockResolvedValue(true);
  const onUnpublish = vi.fn().mockResolvedValue(true);
  const view = render(
    <MobileEditor pageId="page-123" onSave={onSave} onPublish={onPublish} onUnpublish={onUnpublish} {...overrides} />,
  );
  return Object.assign(view, { onSave, onPublish, onUnpublish });
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}

function byLabel(root: ParentNode, label: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`Nothing labelled "${label}"`);
  return found;
}

/** Opens a block's sheet by tapping its card. */
function openCard(view: RenderResult, title: string) {
  const label = [...view.container.querySelectorAll('[role="listitem"] p')].find((p) => p.textContent === title) as HTMLElement;
  click(label);
}

function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y, identifier: 0, target };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  act(() => {
    target.dispatchEvent(event);
  });
}

const OTHER: PresenceEntry = { connectionId: 'c-other', userId: 'u-other', username: 'Marta' };

describe('Quick Edit, QA round 1', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetEditorStore(makePage(blocks()));
    setNavigatorOnline(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  describe('QA-014 publishing after the first publish', () => {
    it('offers "Publicar cambios" when the published page has newer edits, and it publishes', async () => {
      useEditorStore.setState((s) => ({ page: { ...s.page, status: 'published', hasUnpublishedChanges: true, isOwner: true } }));
      const view = renderEditor();

      const globe = byLabel(view.container, 'Publicar cambios (hay cambios sin publicar)');
      click(globe);
      expect(document.body.textContent).toContain('Cambios sin publicar');

      await act(async () => {
        button(document.body, 'Publicar cambios').click();
      });
      expect(view.onPublish).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    it('a published page without changes links to itself and can be unpublished', () => {
      useEditorStore.setState((s) => ({ page: { ...s.page, status: 'published', hasUnpublishedChanges: false, isOwner: true } }));
      const view = renderEditor();

      click(byLabel(view.container, 'Página publicada'));
      expect(document.body.querySelector('a[href="/p/test-page"]')).not.toBeNull();
      expect(() => button(document.body, 'Publicar cambios')).toThrow();
      click(button(document.body, 'Despublicar'));
      expect(document.body.textContent).toContain('¿Despublicar la página?');
      view.unmount();
    });

    it('a collaborator is told only the owner publishes', () => {
      useEditorStore.setState((s) => ({ page: { ...s.page, status: 'published', hasUnpublishedChanges: true, isOwner: false } }));
      const view = renderEditor();

      click(byLabel(view.container, 'Publicación'));
      expect(document.body.textContent).toContain('Solo el propietario de la página puede publicarla');
      expect(() => button(document.body, 'Publicar cambios')).toThrow();
      expect(() => button(document.body, 'Despublicar')).toThrow();
      view.unmount();
    });
  });

  describe('QA-067 undo/redo, AI and what stays on the computer', () => {
    it('the undo button is disabled with nothing to undo and undoes the last change', () => {
      const view = renderEditor();
      const undo = byLabel(view.container, 'Deshacer') as HTMLButtonElement;
      expect(undo.disabled).toBe(true);

      act(() => { useEditorStore.getState().updateBlockField(HERO, ['title'], 'Adiós'); });
      expect(undo.disabled).toBe(false);
      click(undo);
      expect(useEditorStore.getState().page.blocks[0].data).toMatchObject({ title: 'Hola' });
      expect((byLabel(view.container, 'Rehacer') as HTMLButtonElement).disabled).toBe(false);
      view.unmount();
    });

    it('"Mejorar con IA" rewrites the block with the edit-ai answer', async () => {
      // MOBILE2-001: the sheet's own block lock belongs to this connection
      useEditorStore.setState((s) => ({ page: { ...s.page, id: '11111111-1111-4111-8111-111111111111' }, myConnectionId: 'conn-phone' }));
      vi.spyOn(api.ai, 'options').mockResolvedValue({ mode: 'live', examples: [] } as unknown as Awaited<ReturnType<typeof api.ai.options>>);
      const editBlock = vi.spyOn(api.ai, 'editBlock').mockResolvedValue({
        block: { id: HERO, type: 'hero', data: { title: 'Título mejorado' } },
        source: 'live',
      } as unknown as Awaited<ReturnType<typeof api.ai.editBlock>>);
      const view = render(<MobileBlockEditor blockId={HERO} />);

      click(button(view.container, 'Mejorar con IA'));
      // The suggestions wait for the AI mode
      await act(async () => {});
      await act(async () => {
        button(view.container, 'Hazlo más profesional').click();
      });

      expect(editBlock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', HERO, 'Hazlo más profesional', undefined, 'conn-phone');
      expect(useEditorStore.getState().page.blocks[0].data).toMatchObject({ title: 'Título mejorado' });
      view.unmount();
    });

    it('says theme, SEO and versions are changed on a computer', () => {
      const view = renderEditor();
      expect(view.container.textContent).toContain('El tema, el SEO y el historial de versiones se cambian desde un ordenador.');
      view.unmount();
    });
  });

  describe('QA-063 images', () => {
    it('an image field opens the media library', async () => {
      vi.spyOn(api.assets, 'list').mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
      const view = render(<MobileBlockEditor blockId={HERO} />);

      await act(async () => {
        button(view.container, 'Elegir imagen').click();
      });
      // Rendered at the end of <body>, outside the sheet
      expect(document.body.textContent).toContain('Biblioteca de medios');
      expect(view.container.textContent).not.toContain('Biblioteca de medios');
      view.unmount();
    });
  });

  describe('QA-065 sheet swipe', () => {
    it('follows the finger in pixels and closes past the threshold', () => {
      const onClose = vi.fn();
      const view = render(
        <MobileBottomSheet open onClose={onClose} title="Editar Hero"><p>contenido</p></MobileBottomSheet>,
      );
      const dialog = view.container.querySelector('[role="dialog"]') as HTMLElement;
      // From the header, not only the small handle
      const header = view.container.querySelector('h2') as HTMLElement;

      touch(header, 'touchstart', 100, 200);
      touch(header, 'touchmove', 100, 260);
      expect(dialog.style.transform).toBe('translateY(60px)');
      touch(header, 'touchend', 100, 260);
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe('');

      touch(header, 'touchstart', 100, 200);
      touch(header, 'touchmove', 100, 340);
      touch(header, 'touchend', 100, 340);
      expect(onClose).toHaveBeenCalledTimes(1);
      view.unmount();
    });
  });

  // QA-066 (back button) lives in QuickEditBackButton.test.tsx: it needs a history no other test touches

  describe('QA-070 swipe actions', () => {
    it('swipe left reveals "Eliminar", not "Listo"', () => {
      const onDelete = vi.fn();
      const view = render(
        <MobileBlockCard
          block={blocks()[0]}
          index={0}
          isFirst
          isLast={false}
          isPreviewExpanded={false}
          onTap={vi.fn()}
          onLongPress={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={onDelete}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          onDragHandleProps={{ onTouchStart: vi.fn() }}
        />,
      );
      const card = view.container.querySelector('[role="listitem"] .relative.bg-surface-card') as HTMLElement;
      touch(card, 'touchstart', 300, 100);
      touch(card, 'touchmove', 250, 100);
      touch(card, 'touchmove', 180, 100);
      touch(card, 'touchend', 180, 100);

      expect(() => button(view.container, 'Listo')).toThrow();
      click(button(view.container, 'Eliminar'));
      expect(onDelete).toHaveBeenCalledWith(HERO);
      view.unmount();
    });

    it('duplicating says so with a "Deshacer" that removes the copy', () => {
      const view = renderEditor();
      click(byLabel(view.container, 'Opciones para Hero'));
      click([...view.container.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('Duplicar')) as HTMLElement);

      expect(useEditorStore.getState().page.blocks).toHaveLength(3);
      const toast = useEditorStore.getState().toasts.at(-1);
      expect(toast?.message).toBe('Bloque duplicado');
      expect(toast?.action?.label).toBe('Deshacer');
      act(() => { toast?.action?.onClick(); });
      expect(useEditorStore.getState().page.blocks.map((b) => b.id)).toEqual([HERO, FAQ]);
      // Nothing stays selected (and locked) without its sheet
      expect(useEditorStore.getState().selectedBlockId).toBeNull();
      view.unmount();
    });
  });

  describe('QA-071 touch reorder over a long list', () => {
    const rects = [
      { top: 0, height: 80 },
      { top: 90, height: 80 },
      { top: 180, height: 80 },
    ];

    it('drops before the first item whose middle is below the finger', () => {
      expect(dropIndexAt(10, rects)).toBe(0);
      expect(dropIndexAt(100, rects)).toBe(1);
      expect(dropIndexAt(500, rects)).toBe(3);
    });

    it('measures again after the list scrolled: the same finger lands further down', () => {
      const scrolled = rects.map((r) => ({ ...r, top: r.top - 90 }));
      expect(dropIndexAt(100, scrolled)).toBe(2);
    });

    it('scrolls near the edges, faster closer to them, and not in the middle', () => {
      expect(autoScrollSpeed(400, 100, 700)).toBe(0);
      expect(autoScrollSpeed(105, 100, 700)).toBeLessThan(0);
      expect(autoScrollSpeed(695, 100, 700)).toBeGreaterThan(0);
      expect(autoScrollSpeed(699, 100, 700)).toBeGreaterThan(autoScrollSpeed(700 - AUTO_SCROLL_EDGE + 5, 100, 700));
    });
  });

  describe('QA-073 locks and presence', () => {
    it('a block someone else holds does not open, and its card says who has it', () => {
      useEditorStore.setState({ myConnectionId: 'c-me', myUserId: 'u-me', blockLocks: { [HERO]: OTHER }, presence: [OTHER] });
      const view = renderEditor();

      expect(view.container.textContent).toContain('Marta lo está editando');
      openCard(view, 'Hero');
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(useEditorStore.getState().lockRefusal?.blockId).toBe(HERO);
      expect(byLabel(view.container, 'También editando: Marta')).toBeTruthy();
      view.unmount();
    });

    it('the sheet closes when the block is taken away (lock lost) and closing it lets the block go', () => {
      const view = renderEditor();
      openCard(view, 'Hero');
      expect(useEditorStore.getState().selectedBlockId).toBe(HERO);

      act(() => { useEditorStore.setState({ selectedBlockId: null }); });
      expect(document.querySelector('[role="dialog"]')).toBeNull();

      openCard(view, 'Hero');
      click(button(document.body, 'Listo'));
      expect(useEditorStore.getState().selectedBlockId).toBeNull();
      view.unmount();
    });
  });

  describe('QA-008 saving is retried by the save controller, not by Quick Edit', () => {
    it('going back online does not save from here', () => {
      const view = renderEditor();
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(view.onSave).not.toHaveBeenCalled();
      view.unmount();
    });
  });

  describe('QA-104 guest banner on a phone', () => {
    it('is one short line with a short action', () => {
      const view = render(
        <GuestSessionProvider user={guestUser} onClaimed={vi.fn()}>
          <GuestBanner compact />
        </GuestSessionProvider>,
      );
      const banner = view.container.querySelector('[role="region"]') as HTMLElement;
      expect(banner.className).not.toContain('flex-wrap');
      expect(banner.textContent).toContain('Sesión temporal');
      expect(button(banner, 'Crear cuenta')).toBeTruthy();
      view.unmount();
    });
  });

  describe('QA-105 sheet details', () => {
    it('link fields get the URL keyboard without capitals', () => {
      const view = render(<MobileBlockEditor blockId={HERO} />);
      const link = view.container.querySelector('#mobile-field-buttonLink') as HTMLInputElement;
      expect(link.getAttribute('inputmode')).toBe('url');
      expect(link.getAttribute('autocapitalize')).toBe('none');
      view.unmount();
    });

    it('focus starts on the first field with a mouse, on the title on a touch screen', () => {
      const media = installMatchMedia(1200, { pointer: 'fine' });
      let view = render(
        <MobileBottomSheet open onClose={vi.fn()} title="Editar"><input aria-label="Campo" /></MobileBottomSheet>,
      );
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Campo');
      view.unmount();

      media.setViewport({ width: 390, height: 844, pointer: 'coarse' });
      view = render(
        <MobileBottomSheet open onClose={vi.fn()} title="Editar"><input aria-label="Campo" /></MobileBottomSheet>,
      );
      expect(document.activeElement?.tagName).toBe('H2');
      expect(document.activeElement?.textContent).toBe('Editar');
      view.unmount();
      media.restore();
    });

    it('opening "Estilos" scrolls it into view', () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
      const view = render(<MobileBlockEditor blockId={HERO} />);
      click(button(view.container, 'Estilos'));
      expect(scrollIntoView).toHaveBeenCalled();
      view.unmount();
    });
  });

  describe('QA-081 sheet header', () => {
    it('shows the block name, not its raw type id', () => {
      useEditorStore.setState((s) => ({ page: { ...s.page, blocks: [makeBlock('customHtml', {}, { id: 'b-html' })] } }));
      const view = render(<MobileBlockEditor blockId="b-html" />);
      expect(view.container.textContent).not.toContain('customHtml');
      view.unmount();
    });
  });

  describe('QA-106 typing does not re-render every card', () => {
    it('editing one block re-renders only its card', () => {
      const label = vi.spyOn(blockI18n, 'getTranslatedBlockLabel');
      const view = renderEditor();
      const faqRendersBefore = label.mock.calls.filter(([type]) => type === 'faq').length;

      act(() => { useEditorStore.getState().updateBlockField(HERO, ['title'], 'Hola de nuevo'); });

      const faqRendersAfter = label.mock.calls.filter(([type]) => type === 'faq').length;
      expect(faqRendersAfter).toBe(faqRendersBefore);
      expect(view.container.textContent).toContain('Hola de nuevo');
      view.unmount();
    });
  });

  describe('QA-111 preview bar', () => {
    it('is opaque and sits above the home indicator', () => {
      const view = render(<MobilePreview page={useEditorStore.getState().page} onBack={vi.fn()} />);
      const bar = button(view.container, 'Volver al editor').parentElement as HTMLElement;
      expect(bar.className).toContain('bg-surface-card');
      expect(bar.className).not.toMatch(/bg-surface-card\/\d+/);
      expect(bar.className).toContain('env(safe-area-inset-bottom)');
      view.unmount();
    });
  });

  describe('QA-122 colors from the theme', () => {
    it('offers each theme color once', () => {
      const tokens = cloneDesignTokens(defaultDesignTokens);
      tokens.colors.accent = tokens.colors.primary;
      const swatches = themeSwatches(tokens).map((s) => s.color.toLowerCase());
      expect(new Set(swatches).size).toBe(swatches.length);
      expect(swatches).toContain(tokens.colors.primary.toLowerCase());
      expect(swatches).toContain(tokens.colors.background.toLowerCase());
    });

    it('the background choices are the page theme colors', () => {
      const view = render(<MobileBlockEditor blockId={HERO} />);
      click(button(view.container, 'Estilos'));
      const primary = useEditorStore.getState().page.designTokens.colors.primary;
      click(byLabel(view.container, `Color principal del tema (${primary})`));
      expect(useEditorStore.getState().page.blocks[0].styles.bgColor).toBe(primary);
      view.unmount();
    });

    it('the sheet handle is visible on a light sheet', () => {
      const view = render(<MobileBottomSheet open onClose={vi.fn()} title="Editar"><p /></MobileBottomSheet>);
      const handle = view.container.querySelector('[data-testid="sheet-drag-area"] .rounded-full') as HTMLElement;
      expect(handle.className).toContain('bg-muted');
      view.unmount();
    });
  });

  describe('QA-123 block menu', () => {
    it('closes on a tap elsewhere without swallowing it', () => {
      const onTap = vi.fn();
      const view = render(
        <>
          <MobileBlockCard
            block={blocks()[0]}
            index={0}
            isFirst
            isLast={false}
            isPreviewExpanded={false}
            onTap={vi.fn()}
            onLongPress={vi.fn()}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
            onMoveUp={vi.fn()}
            onMoveDown={vi.fn()}
            onDragHandleProps={{ onTouchStart: vi.fn() }}
          />
          <button type="button" onClick={onTap}>Otra cosa</button>
        </>,
      );
      click(byLabel(view.container, 'Opciones para Hero'));
      expect(view.container.querySelector('[role="menu"]')).not.toBeNull();
      // The scrim does not catch taps
      expect(view.container.querySelector('.fixed.inset-0')?.className).toContain('pointer-events-none');

      const other = button(view.container, 'Otra cosa');
      act(() => { other.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      click(other);
      expect(view.container.querySelector('[role="menu"]')).toBeNull();
      expect(onTap).toHaveBeenCalledTimes(1);
      view.unmount();
    });
  });

  describe('QA-125 and QA-126 toolbar', () => {
    it('says the save state in words at 12 px', () => {
      useEditorStore.setState({ autoSaveStatus: 'saved' });
      const view = renderEditor();
      const status = view.container.querySelector('[role="status"]') as HTMLElement;
      expect(status.textContent).toBe('Guardado');
      expect(status.className).toContain('text-xs');
      view.unmount();
    });

    it('gives a long page name all the room there is and its full text as a title', () => {
      const name = 'Un nombre de página bastante largo para un móvil';
      useEditorStore.setState((s) => ({ page: { ...s.page, name } }));
      const view = renderEditor();
      const nameButton = view.container.querySelector('button[aria-label^="Editar nombre"]') as HTMLElement;
      expect(nameButton.className).not.toMatch(/max-w-\[/);
      expect(nameButton.getAttribute('title')).toBe(name);
      view.unmount();
    });
  });
});

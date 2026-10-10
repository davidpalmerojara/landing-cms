/**
 * Quick Edit fixes from QA round 2 (batch C): toasts clear of open sheets,
 * one publish message, titles that fit the person, back closing dialogs, the
 * carried card following the finger, the "not saved yet" state. In its own
 * file: `useCloseOnBack` keeps module state and shares the window history.
 */
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MobileEditor from '@/components/mobile-editor/MobileEditor';
import MobileImageField from '@/components/mobile-editor/MobileImageField';
import GuestBanner from '@/components/guest/GuestBanner';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import { ToastContainer } from '@/components/ui/Toast';
import { useEditorStore } from '@/store/editor-store';
import { MESSAGES } from '@/lib/i18n';
import { guestUser } from '../guest/test-helpers';
import { click, makeBlock, makePage, render, resetEditorStore, setNavigatorOnline, type RenderResult } from './test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const HERO = 'b-hero';

function StoreToasts() {
  const toasts = useEditorStore((s) => s.toasts);
  const removeToast = useEditorStore((s) => s.removeToast);
  return <ToastContainer toasts={toasts} onDismiss={removeToast} placement="aboveFab" />;
}

function renderEditor(): RenderResult & { onPublish: ReturnType<typeof vi.fn> } {
  const onPublish = vi.fn().mockResolvedValue(true);
  const view = render(
    <>
      <MobileEditor
        pageId="page-123"
        onSave={vi.fn().mockResolvedValue(true)}
        onPublish={onPublish}
        onUnpublish={vi.fn().mockResolvedValue(true)}
      />
      <StoreToasts />
    </>,
  );
  return Object.assign(view, { onPublish });
}

function byLabel(root: ParentNode, label: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`Nothing labelled "${label}"`);
  return found;
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
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

const placement = () => document.querySelector('[data-placement]')?.getAttribute('data-placement');
const onSheetEntry = () => Boolean((window.history.state as { paxlSheet?: boolean } | null)?.paxlSheet);

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe('Quick Edit, QA round 2', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetEditorStore(makePage([
      makeBlock('hero', { title: 'Hola', buttonText: 'Empezar', buttonLink: '' }, { id: HERO }),
      makeBlock('faq', { title: 'Preguntas' }, { id: 'b-faq' }),
    ]));
    setNavigatorOnline(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(async () => {
    // Let a closed sheet give its history entry back before the next test
    await act(async () => {
      await vi.waitFor(() => expect(onSheetEntry()).toBe(false), { timeout: 3000 });
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
  });

  describe('MOBILE2-004 toasts clear of what is open', () => {
    it('sit above the "+" button, and move to the top while a sheet is open', async () => {
      const view = renderEditor();
      act(() => useEditorStore.getState().addToast('Hecho', 'success'));
      expect(placement()).toBe('aboveFab');

      click(byLabel(view.container, 'Publicar página'));
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(placement()).toBe('top');

      await goBack();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(placement()).toBe('aboveFab');
      view.unmount();
    });

    it('move to the top over the preview too', () => {
      const view = renderEditor();
      click(byLabel(view.container, 'Vista previa'));
      expect(placement()).toBe('top');
      view.unmount();
    });
  });

  describe('MOBILE2-005 one message when publishing', () => {
    it('says it once, with a note for a phone about the buttons without a link', async () => {
      const view = renderEditor();
      click(byLabel(view.container, 'Publicar página'));
      await act(async () => {
        button(document.body, 'Publicar').click();
      });

      const messages = [...document.querySelectorAll('[data-variant]')].map((toast) => toast.textContent ?? '');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Página publicada.');
      expect(messages[0]).toContain('al editar cada bloque');
      expect(messages[0]).not.toContain('inspector');
      view.unmount();
    });

    it('without such buttons it is just "Página publicada"', async () => {
      useEditorStore.setState((s) => ({
        page: { ...s.page, blocks: [makeBlock('faq', { title: 'Preguntas' }, { id: 'b-faq' })] },
      }));
      const view = renderEditor();
      click(byLabel(view.container, 'Publicar página'));
      await act(async () => {
        button(document.body, 'Publicar').click();
      });

      const messages = [...document.querySelectorAll('[data-variant]')].map((toast) => toast.textContent ?? '');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('Página publicada');
      view.unmount();
    });
  });

  describe('MOBILE2-010 / COLLAB2-006 the publish sheet fits the state and the person', () => {
    const titleOf = () => document.querySelector('[role="dialog"]')?.getAttribute('aria-label');

    it('the owner sees "Publicar página" for a draft and "Publicar cambios" for unpublished changes', async () => {
      let view = renderEditor();
      click(byLabel(view.container, 'Publicar página'));
      expect(titleOf()).toBe('Publicar página');
      await goBack();
      view.unmount();

      useEditorStore.setState((s) => ({ page: { ...s.page, status: 'published', hasUnpublishedChanges: true, isOwner: true } }));
      view = renderEditor();
      click(byLabel(view.container, 'Publicar cambios (hay cambios sin publicar)'));
      expect(titleOf()).toBe('Publicar cambios');
      view.unmount();
    });

    it('a collaborator is not promised a public page: only the owner-only note', () => {
      useEditorStore.setState((s) => ({ page: { ...s.page, isOwner: false } }));
      const view = renderEditor();
      // EDITOR3-004: the button is named for what it opens, not "Publicar página"
      expect(view.container.querySelector('button[aria-label="Publicar página"]')).toBeNull();
      click(byLabel(view.container, 'Publicación'));

      expect(titleOf()).toBe('Publicación');
      expect(document.body.textContent).not.toContain('será visible');
      expect(document.body.textContent).toContain('Solo el propietario de la página puede publicarla');
      view.unmount();
    });
  });

  describe('MOBILE2-007 back closes the question instead of leaving', () => {
    it('the delete confirmation', async () => {
      const view = renderEditor();
      act(() => useEditorStore.getState().requestDeleteBlock(HERO));
      expect(useEditorStore.getState().pendingDeleteBlockId).toBe(HERO);
      expect(onSheetEntry()).toBe(true);

      await goBack();
      expect(useEditorStore.getState().pendingDeleteBlockId).toBeNull();
      expect(useEditorStore.getState().page.blocks).toHaveLength(2);
      view.unmount();
    });

    it('the guest "Crear cuenta" dialog', async () => {
      const view = render(
        <GuestSessionProvider user={guestUser} onClaimed={vi.fn()}>
          <GuestBanner compact />
        </GuestSessionProvider>,
      );
      click(button(view.container, 'Crear cuenta'));
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(onSheetEntry()).toBe(true);

      await goBack();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      view.unmount();
    });
  });

  describe('MOBILE2-008 the carried card follows the finger', () => {
    it('moves with the finger and the floating buttons get out of the way until it is dropped', () => {
      vi.useFakeTimers();
      const view = renderEditor();
      const firstItem = view.container.querySelector('[role="listitem"]') as HTMLElement;
      const handle = firstItem.querySelector('[data-drag-handle]') as HTMLElement;
      const main = view.container.querySelector('main') as HTMLElement;

      touch(handle, 'touchstart', 30, 200);
      act(() => { vi.advanceTimersByTime(200); });
      touch(main, 'touchmove', 30, 260);

      expect((firstItem.parentElement as HTMLElement).style.transform).toContain('translateY(60px)');
      expect(view.container.querySelector('[aria-label="Añadir bloque"]')).toBeNull();

      touch(main, 'touchend', 30, 260);
      expect((firstItem.parentElement as HTMLElement).style.transform).toBe('');
      expect(view.container.querySelector('[aria-label="Añadir bloque"]')).not.toBeNull();
      view.unmount();
    });
  });

  describe('MOBILE2-012 the wait before saving is said', () => {
    it('shows "Sin guardar" after an edit until the save starts', () => {
      const view = renderEditor();
      const status = () => view.container.querySelector('[role="status"]')?.textContent ?? '';
      expect(status()).toBe('');

      act(() => {
        useEditorStore.getState().updateBlock(HERO, 'title', 'Nuevo');
      });
      expect(status()).toBe('Sin guardar');

      act(() => useEditorStore.setState({ autoSaveStatus: 'saving' }));
      expect(status()).toContain('Guardando');
      act(() => useEditorStore.setState({ autoSaveStatus: 'saved' }));
      expect(status()).toContain('Guardado');
      view.unmount();
    });

    it('does not wait for other people\'s changes', () => {
      const view = renderEditor();
      act(() => {
        useEditorStore.setState((s) => ({ isRemoteUpdate: true, page: { ...s.page, name: 'De otra persona' } }));
      });
      expect(view.container.querySelector('[role="status"]')?.textContent).toBe('');
      view.unmount();
    });
  });

  describe('MOBILE2-009 an address that is not an image', () => {
    it('leaves no empty box behind', () => {
      const view = render(<MobileImageField id="img" label="Imagen" value="https://example.com/no.png" onChange={vi.fn()} />);
      const image = view.container.querySelector('img') as HTMLImageElement;
      expect(image).not.toBeNull();

      act(() => {
        image.dispatchEvent(new Event('error'));
      });
      expect(view.container.querySelector('img')).toBeNull();
      view.unmount();
    });
  });

  describe('MOBILE2-006 / MOBILE2-011 wording', () => {
    it('on a phone nothing mentions a keyboard shortcut', () => {
      for (const locale of ['es', 'en'] as const) {
        const { deleteBlockMessage, recoveredChanges } = MESSAGES[locale].mobile;
        expect(deleteBlockMessage).not.toMatch(/ctrl|⌘|\{undo\}/i);
        expect(recoveredChanges).not.toMatch(/ctrl|⌘|\{undo\}/i);
      }
    });

    it('the English "no background" option reads naturally', () => {
      expect(MESSAGES.en.mobile.styles.noBackground).not.toBe("Theme's");
    });
  });
});

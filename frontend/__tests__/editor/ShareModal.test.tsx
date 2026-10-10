import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import ShareModal, { shareErrorKey } from '@/components/editor/ShareModal';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import { useEditorStore } from '@/store/editor-store';
import { api, ApiError } from '@/lib/api';
import { buttonByText, guestUser, normalUser, typeInto } from '../guest/test-helpers';
import { click, render, resetEditorStore } from '../mobile-editor/test-utils';
import type { RenderResult } from '../mobile-editor/test-utils';

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const owner = { id: 'u1', username: 'ana', email: 'ana@example.com' };
const collaborator = { id: 'u2', username: 'luis', email: 'luis@example.com' };

async function open(asUser: typeof normalUser): Promise<RenderResult> {
  useEditorStore.setState({ myUserId: asUser.id });
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(
      <GuestSessionProvider user={asUser} onClaimed={() => undefined}>
        <ShareModal pageId={PAGE_ID} onClose={() => undefined} />
      </GuestSessionProvider>,
    );
  });
  if (!view) throw new Error('not rendered');
  return view;
}

const text = (view: RenderResult) => view.container.textContent ?? '';
const removeButtons = (view: RenderResult) => view.container.querySelectorAll('button[aria-label^="Eliminar colaborador"]');

describe('ShareModal', () => {
  let view: RenderResult;

  beforeEach(() => {
    resetEditorStore();
    vi.spyOn(api.pages, 'collaborators').mockResolvedValue({ owner, collaborators: [collaborator] });
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  describe('who can do what', () => {
    it('the owner can invite by email and by link, and remove collaborators', async () => {
      view = await open(normalUser);

      expect(view.container.querySelector('input[type="email"]')).not.toBeNull();
      expect(text(view)).toContain('Invitar con un enlace');
      expect(removeButtons(view)).toHaveLength(1);
    });

    it('a collaborator only sees who has access', async () => {
      view = await open({ ...normalUser, id: collaborator.id, username: collaborator.username });

      expect(view.container.querySelector('input[type="email"]')).toBeNull();
      expect(text(view)).not.toContain('Invitar con un enlace');
      expect(removeButtons(view)).toHaveLength(0);
      expect(text(view)).toContain('Solo el propietario puede invitar o quitar colaboradores.');
    });

    it('a guest owner can invite with a link but not by email', async () => {
      vi.mocked(api.pages.collaborators).mockResolvedValue({
        owner: { id: guestUser.id, username: guestUser.username, email: guestUser.email },
        collaborators: [],
      });
      view = await open(guestUser);

      expect(view.container.querySelector('input[type="email"]')).toBeNull();
      expect(text(view)).toContain('Invitar por email necesita una cuenta');
      expect(text(view)).toContain('Invitar con un enlace');
    });

    it('an empty list tells a guest to use a link and anyone else to invite by email', async () => {
      const alone = { owner, collaborators: [] };
      vi.mocked(api.pages.collaborators).mockResolvedValue({
        owner: { id: guestUser.id, username: guestUser.username, email: guestUser.email },
        collaborators: [],
      });
      view = await open(guestUser);
      expect(text(view)).toContain('Crea un enlace de invitación');
      expect(text(view)).not.toContain('por email.');
      view.unmount();

      vi.mocked(api.pages.collaborators).mockResolvedValue(alone);
      view = await open(normalUser);
      expect(text(view)).toContain('Invita a alguien por email.');
      expect(text(view)).not.toContain('Crea un enlace de invitación');
    });
  });

  describe('invite link', () => {
    it('creates the link, shows it with the incognito hint and copies it', async () => {
      const invite = vi.spyOn(api.pages, 'invite').mockResolvedValue({
        token: 'tok123', path: '/join/tok123', expires_at: '2026-10-10T10:00:00Z',
      });
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      view = await open(normalUser);

      await act(async () => { buttonByText(view.container, 'Crear enlace de invitación').click(); });

      expect(invite).toHaveBeenCalledWith(PAGE_ID);
      const input = view.container.querySelector<HTMLInputElement>('#share-invite-link');
      expect(input?.value).toBe(`${window.location.origin}/join/tok123`);
      expect(view.container.querySelector('label[for="share-invite-link"]')?.textContent).toBe('Enlace de invitación');
      expect(text(view)).toContain('Ábrelo en una ventana de incógnito para probar la edición en tiempo real.');

      await act(async () => { buttonByText(view.container, 'Copiar enlace').click(); });
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok123`);
      expect(text(view)).toContain('Enlace copiado');
      vi.unstubAllGlobals();
    });

    it('explains when the clipboard is not available', async () => {
      vi.spyOn(api.pages, 'invite').mockResolvedValue({ token: 't', path: '/join/t', expires_at: '' });
      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
      view = await open(normalUser);

      await act(async () => { buttonByText(view.container, 'Crear enlace de invitación').click(); });
      await act(async () => { buttonByText(view.container, 'Copiar enlace').click(); });

      expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo copiar');
      vi.unstubAllGlobals();
    });

    it('shows an error when the link cannot be created', async () => {
      vi.spyOn(api.pages, 'invite').mockRejectedValue(new Error('API 403'));
      view = await open(normalUser);

      await act(async () => { buttonByText(view.container, 'Crear enlace de invitación').click(); });

      expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('No se pudo crear el enlace. Inténtalo de nuevo.');
      expect(view.container.querySelector('#share-invite-link')).toBeNull();
    });
  });

  it('removing a collaborator calls the API and reloads the list', async () => {
    const unshare = vi.spyOn(api.pages, 'unshare').mockResolvedValue({ message: 'Eliminado' });
    view = await open(normalUser);

    const [remove] = removeButtons(view);
    await act(async () => { click(remove); });

    expect(unshare).toHaveBeenCalledWith(PAGE_ID, collaborator.id);
    // The confirmation is the app's own words, not the server's
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Esa persona ya no tiene acceso a la página.');
  });

  describe('QA-062', () => {
    it('gives focus back to the button that opened it when it closes', async () => {
      const opener = document.createElement('button');
      opener.textContent = 'Compartir';
      document.body.appendChild(opener);
      opener.focus();
      view = await open(normalUser);
      expect(document.activeElement).not.toBe(opener);

      act(() => { view.unmount(); });

      expect(document.activeElement).toBe(opener);
      opener.remove();
      view = render(<div />);
    });

    it('closes on Escape', async () => {
      const onClose = vi.fn();
      useEditorStore.setState({ myUserId: normalUser.id });
      await act(async () => {
        view = render(
          <GuestSessionProvider user={normalUser} onClaimed={() => undefined}>
            <ShareModal pageId={PAGE_ID} onClose={onClose} />
          </GuestSessionProvider>,
        );
      });
      const dialog = view.container.querySelector('[role="dialog"]');
      act(() => { dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Also when focus is no longer inside (the create-link button was replaced)
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('shows a guest as "Invitado", never with the placeholder email', async () => {
      vi.mocked(api.pages.collaborators).mockResolvedValue({
        owner: { id: guestUser.id, username: guestUser.username, email: guestUser.email },
        collaborators: [{ id: 'g2', username: 'invitado-0a1b2c3d', email: 'invitado-0a1b2c3d@guest.invalid' }],
      });
      view = await open(guestUser);

      expect(text(view)).toContain('Invitado');
      expect(text(view)).not.toContain('invitado-');
      expect(text(view)).not.toContain('guest.invalid');
    });

    it('reloads the list when someone it does not show joins the page', async () => {
      view = await open(normalUser);
      const load = vi.mocked(api.pages.collaborators);
      expect(load).toHaveBeenCalledTimes(1);

      // Someone already listed connecting changes nothing
      await act(async () => {
        useEditorStore.setState({ presence: [{ connectionId: 'c1', userId: owner.id, username: 'ana' }] });
      });
      expect(load).toHaveBeenCalledTimes(1);

      load.mockResolvedValue({ owner, collaborators: [collaborator, { id: 'g9', username: 'invitado-99999999', email: 'invitado-99999999@guest.invalid' }] });
      await act(async () => {
        useEditorStore.setState({
          presence: [
            { connectionId: 'c1', userId: owner.id, username: 'ana' },
            { connectionId: 'c2', userId: 'g9', username: 'Invitado 1' },
          ],
        });
      });
      expect(load).toHaveBeenCalledTimes(2);
      expect(removeButtons(view)).toHaveLength(2);
    });

    it('translates errors instead of showing the server text', async () => {
      vi.spyOn(api.pages, 'share').mockRejectedValue(new ApiError(400, JSON.stringify({ error: 'No puedes compartir contigo mismo.' })));
      view = await open(normalUser);
      const input = view.container.querySelector<HTMLInputElement>('input[type="email"]');
      if (!input) throw new Error('no email field');
      typeInto(input, 'ana@example.com');
      await act(async () => { view.container.querySelector<HTMLFormElement>('form')?.requestSubmit(); });

      const alert = view.container.querySelector('[role="alert"]')?.textContent ?? '';
      expect(alert).toBe('No puedes compartir la página contigo.');
      expect(alert).not.toContain('API');
    });

    it('maps each failure to its message', () => {
      expect(shareErrorKey(new ApiError(400, JSON.stringify({ details: { email: ['bad'] } })), 'share')).toBe('share.invalidEmail');
      expect(shareErrorKey(new ApiError(403, '{}'), 'remove')).toBe('share.notOwner');
      expect(shareErrorKey(new ApiError(404, '{}'), 'remove')).toBe('share.notCollaborator');
      expect(shareErrorKey(new ApiError(429, '{}'), 'share')).toBe('share.throttled');
      expect(shareErrorKey(new Error('offline'), 'share')).toBe('share.shareError');
    });
  });
});

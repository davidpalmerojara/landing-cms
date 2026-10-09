import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import ShareModal from '@/components/editor/ShareModal';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import { useEditorStore } from '@/store/editor-store';
import { api } from '@/lib/api';
import { buttonByText, guestUser, normalUser } from '../guest/test-helpers';
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
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Eliminado');
  });
});

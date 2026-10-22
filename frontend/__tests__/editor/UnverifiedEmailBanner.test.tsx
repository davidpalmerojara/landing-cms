/** C5 (ADR-052): owners of an unverified account are told their published pages are limited, and can verify. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import UnverifiedEmailBanner from '@/components/editor/UnverifiedEmailBanner';
import { ApiError, api } from '@/lib/api';
import { buttonByText, guestUser, normalUser } from '../guest/test-helpers';
import { render, type RenderResult } from '../mobile-editor/test-utils';

let view: RenderResult;

const unverified = { ...normalUser, email_verified: false };
const text = () => document.body.textContent ?? '';

async function mount(user: typeof normalUser | null, emailOn = true, locale: 'es' | 'en' = 'es') {
  vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing: false, email: emailOn });
  await act(async () => {
    view = render(<UnverifiedEmailBanner user={user} />, locale);
  });
  await act(async () => {});
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('unverified email banner', () => {
  it('says what is limited and offers to verify', async () => {
    await mount(unverified);

    expect(text()).toContain('Tu email aún no está verificado');
    expect(text()).toContain('no se indexan');
    expect(buttonByText(view.container, 'Verificar email')).toBeTruthy();
  });

  it('is in English for an English interface', async () => {
    await mount(unverified, true, 'en');
    expect(text()).toContain("Your email isn't verified yet");
  });

  it.each([
    ['a verified account', { ...normalUser, email_verified: true }],
    ['a server that does not say', normalUser],
    ['a guest, which has its own banner', { ...guestUser, email_verified: false }],
    ['nobody', null],
  ])('shows nothing for %s', async (_what, user) => {
    await mount(user);
    expect(view.container.textContent).toBe('');
  });

  it('an account with a password is warned before the link is sent, and can back out', async () => {
    const request = vi.spyOn(api.auth, 'magicRequest').mockResolvedValue({ message: 'ok' });
    await mount(unverified);

    await act(async () => { buttonByText(view.container, 'Verificar email').click(); });
    expect(text()).toContain('se desactiva la contraseña');
    expect(request).not.toHaveBeenCalled();

    await act(async () => { buttonByText(document.body, 'Cancelar').click(); });
    expect(request).not.toHaveBeenCalled();

    await act(async () => { buttonByText(view.container, 'Verificar email').click(); });
    await act(async () => { buttonByText(document.body, 'Enviar enlace').click(); });
    expect(request).toHaveBeenCalledWith(unverified.email);
    expect(text()).toContain(`Te hemos enviado un enlace a ${unverified.email}`);
  });

  it('an account without a password gets the link straight away', async () => {
    const request = vi.spyOn(api.auth, 'magicRequest').mockResolvedValue({ message: 'ok' });
    await mount({ ...unverified, has_password: false });

    await act(async () => { buttonByText(view.container, 'Verificar email').click(); });

    expect(request).toHaveBeenCalledWith(unverified.email);
  });

  it('EMAIL_UNAVAILABLE is explained in plain words, with a way to try again', async () => {
    vi.spyOn(api.auth, 'magicRequest').mockRejectedValue(
      new ApiError(503, '{"error":"texto del servidor","code":"EMAIL_UNAVAILABLE"}'),
    );
    await mount({ ...unverified, has_password: false });

    await act(async () => { buttonByText(view.container, 'Verificar email').click(); });

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No hemos podido enviar el correo');
    expect(alert?.textContent).not.toContain('servidor');
    expect(buttonByText(view.container, 'Reintentar')).toBeTruthy();
  });

  it('with email turned off on the server it says so instead of offering a button that cannot work', async () => {
    await mount(unverified, false);

    expect(text()).toContain('El envío de emails no está disponible');
    expect(() => buttonByText(view.container, 'Verificar email')).toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import { ApiError, api } from '@/lib/api';
import { click, keyDown, render, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText, field, guestUser, normalUser, typeInto } from '../guest/test-helpers';

const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const passwordUser = normalUser;
const passwordlessUser = { ...normalUser, has_password: false };

let view: RenderResult;

function open(user = passwordUser) {
  view = render(<DeleteAccountSection user={user} />);
}

function openDialog(user = passwordUser) {
  open(user);
  click(buttonByText(view.container, 'Eliminar cuenta'));
}

const dialog = () => view.container.querySelector('[role="dialog"]');
const form = () => {
  const el = view.container.querySelector('form');
  if (!el) throw new Error('no form');
  return el;
};

async function confirm() {
  await act(async () => {
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('DeleteAccountSection', () => {
  it('is a labelled section with a button that opens the dialog', () => {
    open();

    const heading = view.container.querySelector('h2');
    expect(heading?.textContent).toBe('Zona de peligro');
    expect(view.container.querySelector('section')?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(dialog()).toBeNull();

    click(buttonByText(view.container, 'Eliminar cuenta'));

    expect(dialog()).not.toBeNull();
  });

  it('is not offered to guests', () => {
    open(guestUser);

    expect(view.container.textContent).toBe('');
  });
});

describe('DeleteAccountDialog', () => {
  it('is a modal dialog that names itself and says what is lost', () => {
    openDialog();

    const element = dialog();
    expect(element?.getAttribute('aria-modal')).toBe('true');
    const title = view.container.querySelector(`[id="${element?.getAttribute('aria-labelledby')}"]`);
    const description = view.container.querySelector(`[id="${element?.getAttribute('aria-describedby')}"]`);
    expect(title?.textContent).toBe('¿Eliminar tu cuenta?');
    expect(description?.textContent).toContain('Esta acción no se puede deshacer');
  });

  it('puts the focus in the dialog and closes with Escape or Cancel', () => {
    openDialog();
    expect(dialog()?.contains(document.activeElement)).toBe(true);

    keyDown(dialog() as HTMLElement, 'Escape');
    expect(dialog()).toBeNull();

    click(buttonByText(view.container, 'Eliminar cuenta'));
    click(buttonByText(view.container, 'Cancelar'));
    expect(dialog()).toBeNull();
  });

  it('asks for the password of an account that has one, and cannot be sent empty', () => {
    openDialog();

    const input = field(form(), 'Contraseña actual');
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('current-password');
    expect(buttonByText(view.container, 'Eliminar mi cuenta').disabled).toBe(true);

    typeInto(input, 'secret');
    expect(buttonByText(view.container, 'Eliminar mi cuenta').disabled).toBe(false);
  });

  it('asks to type the username for an account without a password', () => {
    openDialog(passwordlessUser);

    const input = field(form(), 'Para confirmar, escribe tu nombre de usuario (ana)');
    expect(input.type).toBe('text');
  });

  it('sends the password, then leaves for the landing page', async () => {
    const remove = vi.spyOn(api.auth, 'deleteAccount').mockResolvedValue(undefined);
    openDialog();
    typeInto(field(form(), 'Contraseña actual'), 'secret');

    await confirm();

    expect(remove).toHaveBeenCalledWith({ password: 'secret' });
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('sends the username (trimmed) when there is no password', async () => {
    const remove = vi.spyOn(api.auth, 'deleteAccount').mockResolvedValue(undefined);
    openDialog(passwordlessUser);
    typeInto(field(form(), 'Para confirmar, escribe tu nombre de usuario (ana)'), '  ana ');

    await confirm();

    expect(remove).toHaveBeenCalledWith({ confirm_username: 'ana' });
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows a wrong password as an alert tied to the field and stays open', async () => {
    vi.spyOn(api.auth, 'deleteAccount').mockRejectedValue(
      new ApiError(400, JSON.stringify({ error: 'x', code: 'INVALID_PASSWORD' })),
    );
    openDialog();
    const input = field(form(), 'Contraseña actual');
    typeInto(input, 'wrong');

    await confirm();

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('La contraseña no es correcta.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert?.id);
    expect(replace).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it('clears the error when the person types again', async () => {
    vi.spyOn(api.auth, 'deleteAccount').mockRejectedValue(
      new ApiError(400, JSON.stringify({ error: 'x', code: 'INVALID_PASSWORD' })),
    );
    openDialog();
    const input = field(form(), 'Contraseña actual');
    typeInto(input, 'wrong');
    await confirm();

    typeInto(input, 'wrong2');

    expect(view.container.querySelector('[role="alert"]')).toBeNull();
  });

  it('points to Billing while a paid subscription is running', async () => {
    vi.spyOn(api.auth, 'deleteAccount').mockRejectedValue(
      new ApiError(409, JSON.stringify({ error: 'x', code: 'ACTIVE_SUBSCRIPTION' })),
    );
    openDialog();
    typeInto(field(form(), 'Contraseña actual'), 'secret');

    await confirm();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Cancélala desde Facturación');
    const link = view.container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/settings/billing');
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains too many attempts and any other failure', async () => {
    const remove = vi.spyOn(api.auth, 'deleteAccount').mockRejectedValue(new ApiError(429, '{}'));
    openDialog();
    typeInto(field(form(), 'Contraseña actual'), 'secret');
    await confirm();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Demasiados intentos');

    remove.mockRejectedValue(new ApiError(500, 'boom'));
    typeInto(field(form(), 'Contraseña actual'), 'secret2');
    await confirm();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo eliminar la cuenta');
  });

  it('cannot be closed or sent twice while the request is running', async () => {
    let finish: () => void = () => undefined;
    const remove = vi.spyOn(api.auth, 'deleteAccount').mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    openDialog();
    typeInto(field(form(), 'Contraseña actual'), 'secret');

    await confirm();
    await confirm();
    keyDown(dialog() as HTMLElement, 'Escape');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeNull();
    expect(buttonByText(view.container, 'Eliminando...').getAttribute('aria-busy')).toBe('true');

    await act(async () => finish());
    expect(replace).toHaveBeenCalledWith('/');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import ClaimGuestDialog from '@/components/guest/ClaimGuestDialog';
import { ApiError, api } from '@/lib/api';
import { render, click, keyDown, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText, field, normalUser, submit, typeInto } from './test-helpers';

const onCancel = vi.fn();
const onClaimed = vi.fn();

let view: RenderResult;

function open(): HTMLFormElement {
  view = render(<ClaimGuestDialog onCancel={onCancel} onClaimed={onClaimed} />);
  const form = view.container.querySelector('form');
  if (!form) throw new Error('no form');
  return form;
}

function fillValid(form: HTMLFormElement) {
  typeInto(field(form, 'Usuario'), 'ana');
  typeInto(field(form, 'Email'), 'ana@example.com');
  typeInto(field(form, 'Contraseña'), 'Str0ng-pass-123');
  typeInto(field(form, 'Confirmar contraseña'), 'Str0ng-pass-123');
}

async function submitAndWait(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  view.unmount();
  onCancel.mockReset();
  onClaimed.mockReset();
  vi.restoreAllMocks();
});

describe('ClaimGuestDialog', () => {
  it('is an accessible modal dialog with a labelled field for each value', () => {
    const form = open();
    const dialog = view.container.querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog?.getAttribute('aria-labelledby') ?? '';
    expect(view.container.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Crea tu cuenta y guarda tu trabajo');
    for (const label of ['Usuario', 'Email', 'Contraseña', 'Confirmar contraseña']) {
      expect(field(form, label)).toBeTruthy();
    }
    expect(field(form, 'Contraseña').type).toBe('password');
  });

  it('says what the account will be: free plan, pages kept', () => {
    open();
    expect(view.container.textContent).toContain('plan Free');
    expect(view.container.textContent).toContain('conservas todas tus páginas');
  });

  it('shows an error under each empty field and does not call the API', async () => {
    const claim = vi.spyOn(api.auth, 'claimGuest');
    const form = open();
    await submitAndWait(form);

    expect(claim).not.toHaveBeenCalled();
    const errors = [...view.container.querySelectorAll('p[id$="-error"]')].map((p) => p.textContent);
    expect(errors).toEqual(Array(4).fill('Este campo es obligatorio.'));
    expect(field(form, 'Usuario').getAttribute('aria-invalid')).toBe('true');
    expect(field(form, 'Usuario').getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(field(form, 'Usuario'));
  });

  it('rejects an invalid email and mismatched passwords before sending', async () => {
    const claim = vi.spyOn(api.auth, 'claimGuest');
    const form = open();
    fillValid(form);
    typeInto(field(form, 'Email'), 'no-es-un-email');
    typeInto(field(form, 'Confirmar contraseña'), 'otra-distinta');
    await submitAndWait(form);

    expect(claim).not.toHaveBeenCalled();
    const errors = [...view.container.querySelectorAll('p[id$="-error"]')].map((p) => p.textContent);
    expect(errors).toEqual(['Escribe un email válido.', 'Las contraseñas no coinciden.']);
  });

  it('clears a field error as soon as the person edits that field', async () => {
    const form = open();
    await submitAndWait(form);
    typeInto(field(form, 'Usuario'), 'ana');
    expect(field(form, 'Usuario').getAttribute('aria-invalid')).toBeNull();
    expect(view.container.querySelectorAll('p[id$="-error"]')).toHaveLength(3);
  });

  it('sends trimmed values, then confirms and hands over the new user when continuing', async () => {
    const claim = vi.spyOn(api.auth, 'claimGuest').mockResolvedValue({ user: normalUser });
    const form = open();
    fillValid(form);
    typeInto(field(form, 'Usuario'), '  ana ');
    await submitAndWait(form);

    expect(claim).toHaveBeenCalledWith({
      username: 'ana', email: 'ana@example.com', password: 'Str0ng-pass-123', password2: 'Str0ng-pass-123',
    });
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Cuenta creada');
    expect(onClaimed).not.toHaveBeenCalled();

    const next = buttonByText(view.container, 'Continuar');
    expect(document.activeElement).toBe(next);
    click(next);
    expect(onClaimed).toHaveBeenCalledWith(normalUser);
  });

  it('shows the server validation message under the field it belongs to', async () => {
    vi.spyOn(api.auth, 'claimGuest').mockRejectedValue(
      new ApiError(400, JSON.stringify({
        error: 'Error de validación.',
        code: 'BAD_REQUEST',
        details: { username: ['Ya existe un usuario con ese nombre.'], password: ['Esta contraseña es demasiado común.'] },
      })),
    );
    const form = open();
    fillValid(form);
    await submitAndWait(form);

    const usernameError = view.container.querySelector(`[id="${field(form, 'Usuario').getAttribute('aria-describedby')}"]`);
    expect(usernameError?.textContent).toBe('Ya existe un usuario con ese nombre.');
    expect(field(form, 'Contraseña').getAttribute('aria-invalid')).toBe('true');
    expect(onClaimed).not.toHaveBeenCalled();
  });

  it('explains an expired guest session', async () => {
    vi.spyOn(api.auth, 'claimGuest').mockRejectedValue(
      new ApiError(401, JSON.stringify({ error: 'caducada', code: 'GUEST_EXPIRED' })),
    );
    const form = open();
    fillValid(form);
    await submitAndWait(form);

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('ha caducado');
  });

  it('shows a generic error for anything unexpected and lets the person retry', async () => {
    const claim = vi.spyOn(api.auth, 'claimGuest')
      .mockRejectedValueOnce(new ApiError(500, 'oops'))
      .mockResolvedValueOnce({ user: normalUser });
    const form = open();
    fillValid(form);
    await submitAndWait(form);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo crear la cuenta');

    await submitAndWait(form);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('disables the submit button while the request is running', async () => {
    let resolve: (value: { user: typeof normalUser }) => void = () => undefined;
    vi.spyOn(api.auth, 'claimGuest').mockReturnValue(new Promise((r) => { resolve = r; }));
    const form = open();
    fillValid(form);
    submit(form);

    const submitButton = buttonByText(view.container, 'Creando la cuenta…');
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.getAttribute('aria-busy')).toBe('true');
    await act(async () => resolve({ user: normalUser }));
  });

  it('closes with Escape and with the cancel button', () => {
    open();
    keyDown(view.container.querySelector('[role="dialog"]') as HTMLElement, 'Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);

    click(buttonByText(view.container, 'Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog', () => {
    const form = open();
    const close = view.container.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]');
    const submitButton = buttonByText(form, 'Crear cuenta');
    submitButton.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { submitButton.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});

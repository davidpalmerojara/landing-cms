import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import LoginPage from '@/app/login/page';
import RegisterPage from '@/app/register/page';
import { ApiError, api } from '@/lib/api';
import { buttonByText, field, submit, typeInto } from '../guest/test-helpers';
import { render, type RenderResult } from '../mobile-editor/test-utils';

const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/guest/GuestStartButton', () => ({ default: () => null }));

let view: RenderResult;

const alertText = () => view.container.querySelector('[role="alert"]')?.textContent ?? '';

async function logIn(username = 'ana', password = 'secret-pass') {
  typeInto(field(view.container, 'Usuario'), username);
  typeInto(field(view.container, 'Contraseña'), password);
  await act(async () => {
    submit(view.container.querySelector('form') as HTMLFormElement);
  });
}

beforeEach(() => {
  replace.mockReset();
  window.history.replaceState(null, '', '/login');
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('login page', () => {
  beforeEach(() => {
    view = render(<LoginPage />);
  });

  it('QA-069: the page heading is the action, the brand is a link home', () => {
    expect(view.container.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(view.container.querySelector('a[href="/"]')?.textContent).toBe('Paxl');
  });

  it('APP3-004: the link to register is underlined, not told apart from the sentence by colour alone', () => {
    expect(view.container.querySelector('a[href="/register"]')?.className).toContain('underline');
  });

  it('QA-069: the fields carry autocomplete hints for password managers and no auto-capitalisation', () => {
    const username = field(view.container, 'Usuario');
    const password = field(view.container, 'Contraseña');

    expect(username.autocomplete).toBe('username');
    expect(username.getAttribute('autocapitalize')).toBe('none');
    expect(username.getAttribute('spellcheck')).toBe('false');
    expect(password.autocomplete).toBe('current-password');
  });

  it('QA-069: fields are 16px on phones so iOS does not zoom, and 44px tall', () => {
    const username = field(view.container, 'Usuario');
    expect(username.className).toContain('text-base');
    expect(username.className).toContain('min-h-11');
  });

  it('QA-069: the page has a theme switch (language switch is mocked here)', () => {
    expect(view.container.querySelector('[aria-label="Cambiar a modo claro"], [aria-label="Cambiar a modo oscuro"]')).not.toBeNull();
  });

  it('wrong credentials still say so (401)', async () => {
    vi.spyOn(api.auth, 'login').mockRejectedValue(new ApiError(401, '{"detail":"x"}'));

    await logIn();

    expect(alertText()).toBe('Credenciales incorrectas.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('QA-055: a throttled login does not say the credentials are wrong', async () => {
    vi.spyOn(api.auth, 'login').mockRejectedValue(new ApiError(429, '{"error":"x","code":"THROTTLED"}'));

    await logIn();

    expect(alertText()).toBe('Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.');
  });

  it('QA-055: a server error does not say the credentials are wrong', async () => {
    vi.spyOn(api.auth, 'login').mockRejectedValue(new ApiError(500, '{"error":"x","code":"INTERNAL_ERROR"}'));

    await logIn();

    expect(alertText()).toContain('Algo ha fallado en el servidor');
  });

  it('QA-055: being offline says so', async () => {
    vi.spyOn(api.auth, 'login').mockRejectedValue(new TypeError('Failed to fetch'));

    await logIn();

    expect(alertText()).toContain('No se pudo conectar con el servidor');
  });

  it('QA-055: the magic-link request tells a throttle from a failure too', async () => {
    vi.spyOn(api.auth, 'magicRequest').mockRejectedValue(new ApiError(429, '{"error":"x","code":"THROTTLED"}'));
    click(buttonByText(view.container, 'Iniciar sesión con enlace mágico'));
    typeInto(field(view.container, 'Email'), 'ana@example.com');

    await act(async () => {
      submit(view.container.querySelector('form') as HTMLFormElement);
    });

    expect(alertText()).toContain('Demasiados intentos');
  });

  it('QA-026: after logging in it goes to a safe path only', async () => {
    window.history.replaceState(null, '', '/login?next=/%09/evil.example');
    vi.spyOn(api.auth, 'login').mockResolvedValue({ message: 'ok' });

    await logIn();

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('QA-026: a same-site next path is kept', async () => {
    window.history.replaceState(null, '', '/login?next=/editor/abc');
    vi.spyOn(api.auth, 'login').mockResolvedValue({ message: 'ok' });

    await logIn();

    expect(replace).toHaveBeenCalledWith('/editor/abc');
  });
});

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('register page', () => {
  beforeEach(() => {
    view = render(<RegisterPage />);
  });

  async function fillAndSubmit(values: { username: string; email: string; password: string; password2: string }) {
    typeInto(field(view.container, 'Usuario'), values.username);
    typeInto(field(view.container, 'Email'), values.email);
    typeInto(field(view.container, 'Contraseña'), values.password);
    typeInto(field(view.container, 'Confirmar contraseña'), values.password2);
    await act(async () => {
      submit(view.container.querySelector('form') as HTMLFormElement);
    });
  }

  it('APP3-004: the link to log in is underlined, not told apart from the sentence by colour alone', () => {
    expect(view.container.querySelector('a[href="/login"]')?.className).toContain('underline');
  });

  it('QA-069: heading, autocomplete hints', () => {
    expect(view.container.querySelector('h1')?.textContent).toBe('Crear cuenta');
    expect(field(view.container, 'Contraseña').autocomplete).toBe('new-password');
    expect(field(view.container, 'Confirmar contraseña').autocomplete).toBe('new-password');
    expect(field(view.container, 'Email').autocomplete).toBe('email');
  });

  it('QA-054: every field the server rejects is shown at once, tied to its input', async () => {
    vi.spyOn(api.auth, 'register').mockRejectedValue(new ApiError(400, JSON.stringify({
      error: 'Error de validación.',
      code: 'BAD_REQUEST',
      details: {
        username: ['Ese nombre de usuario ya está en uso.'],
        password: ['Esta contraseña es demasiado común.'],
      },
    })));

    await fillAndSubmit({ username: 'ana', email: 'ana@example.com', password: 'password1', password2: 'password1' });

    const username = field(view.container, 'Usuario');
    const password = field(view.container, 'Contraseña');
    expect(view.container.querySelector(`#${username.getAttribute('aria-describedby')}`)?.textContent)
      .toBe('Ese nombre de usuario ya está en uso.');
    expect(view.container.querySelector(`#${password.getAttribute('aria-describedby')}`)?.textContent)
      .toBe('Esta contraseña es demasiado común.');
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(field(view.container, 'Email').getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(username);
  });

  it('QA-054: the client checks before sending, per field', async () => {
    const register = vi.spyOn(api.auth, 'register');

    await fillAndSubmit({ username: '', email: 'not-an-email', password: 'abc', password2: 'abd' });

    expect(register).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('Este campo es obligatorio.');
    expect(view.container.textContent).toContain('Escribe un email válido.');
    expect(view.container.textContent).toContain('Las contraseñas no coinciden.');
  });

  it('QA-055: a throttled sign-up says to wait, not "error creating the account"', async () => {
    vi.spyOn(api.auth, 'register').mockRejectedValue(new ApiError(429, '{"error":"x","code":"THROTTLED"}'));

    await fillAndSubmit({ username: 'ana', email: 'ana@example.com', password: 'Str0ngP@ss!', password2: 'Str0ngP@ss!' });

    expect(alertText()).toContain('Demasiados intentos');
  });

  it('sends the username and email trimmed', async () => {
    const register = vi.spyOn(api.auth, 'register').mockResolvedValue({ user: {} as never });

    await fillAndSubmit({ username: ' ana ', email: ' ana@example.com ', password: 'Str0ngP@ss!', password2: 'Str0ngP@ss!' });

    expect(register).toHaveBeenCalledWith({
      username: 'ana', email: 'ana@example.com', password: 'Str0ngP@ss!', password2: 'Str0ngP@ss!',
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });
});

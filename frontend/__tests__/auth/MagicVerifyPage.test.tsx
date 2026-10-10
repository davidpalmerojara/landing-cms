import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import MagicVerifyPage from '@/app/auth/magic/[token]/page';
import { ApiError, api } from '@/lib/api';
import type { ApiUser, AuthResponse } from '@/lib/api';
import { render, click, type RenderResult } from '../mobile-editor/test-utils';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ token: 'magic-token' }),
}));

const user: ApiUser = {
  id: 'u1', email: 'ana@example.com', username: 'ana', avatar: '', created_at: '2026-10-01T10:00:00Z', has_password: false, is_guest: false, expires_at: null,
};

async function renderWith(response: AuthResponse): Promise<RenderResult> {
  vi.spyOn(api.auth, 'magicVerify').mockResolvedValue(response);
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(<MagicVerifyPage />);
  });
  if (!view) throw new Error('not rendered');
  return view;
}

describe('MagicVerifyPage', () => {
  let view: RenderResult;

  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockReset();
  });

  afterEach(() => {
    view.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('goes to the dashboard after a normal sign-in', async () => {
    view = await renderWith({ user });

    act(() => { vi.advanceTimersByTime(1600); });

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('explains that the unconfirmed password was turned off and waits for the user', async () => {
    view = await renderWith({ user, password_disabled: true });

    act(() => { vi.advanceTimersByTime(5000); });

    expect(view.container.textContent).toContain('Hemos protegido tu cuenta');
    expect(view.container.querySelector('[role="status"]')).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();

    const button = view.container.querySelector('button');
    if (!button) throw new Error('no continue button');
    click(button);
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('APP2-007: the page title is a heading about signing in, the brand is not the h1', async () => {
    view = await renderWith({ user });

    expect(view.container.querySelector('h1')?.textContent).toBe('Iniciando sesión');
    expect(view.container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('APP2-007: a link that does not work says so, in an alert', async () => {
    vi.spyOn(api.auth, 'magicVerify').mockRejectedValue(new ApiError(400, JSON.stringify({ error: 'x', code: 'INVALID_TOKEN' })));
    await act(async () => {
      view = render(<MagicVerifyPage />);
    });

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Enlace inválido o expirado');
  });

  it.each([
    ['the network is down', new TypeError('Failed to fetch'), 'No se pudo conectar'],
    ['the server throttles', new ApiError(429, '{"error":"x","code":"THROTTLED"}'), 'Demasiados intentos'],
    ['the server fails', new ApiError(500, '{"error":"x"}'), 'Algo ha fallado en el servidor'],
  ])('APP2-007: when %s it does not claim the link is invalid', async (_name, failure, expected) => {
    vi.spyOn(api.auth, 'magicVerify').mockRejectedValue(failure);
    await act(async () => {
      view = render(<MagicVerifyPage />);
    });

    const alert = view.container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain(expected);
    expect(alert).not.toContain('inválido');
  });
});

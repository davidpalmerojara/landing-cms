import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import GuestStartButton from '@/components/guest/GuestStartButton';
import { ApiError, api } from '@/lib/api';
import type { ApiPage, AuthResponse } from '@/lib/api';
import { render, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText, guestUser, normalUser } from './test-helpers';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

let view: RenderResult;

const noSession = () => new ApiError(401, JSON.stringify({ error: 'No hay sesión', code: 'UNAUTHORIZED' }));
const createdPage = { id: 'page-1' } as ApiPage;

function mount(variant: 'hero' | 'form' = 'hero') {
  view = render(<GuestStartButton variant={variant} />);
  return buttonByText(view.container, 'Probar sin registrarse');
}

async function clickAndWait(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  push.mockReset();
  vi.spyOn(api.auth, 'me').mockRejectedValue(noSession());
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
});

describe('GuestStartButton', () => {
  it('offers the action and says up front that the session is temporary', () => {
    const button = mount();
    expect(button.disabled).toBe(false);
    expect(button.className).toContain('min-h-11');
    expect(view.container.textContent).toContain('lo que hagas se borra en 24 h');
  });

  it('starts a guest, creates the SaaS template page and opens the editor', async () => {
    const guest = vi.spyOn(api.auth, 'guest').mockResolvedValue({ user: guestUser });
    const create = vi.spyOn(api.pages, 'create').mockResolvedValue(createdPage);
    await clickAndWait(mount());

    expect(guest).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0] as { name: string; blocks: unknown[]; design_tokens: unknown };
    expect(payload.name).toBe('SaaS Landing');
    expect(payload.blocks.length).toBeGreaterThan(3);
    expect(push).toHaveBeenCalledWith('/editor/page-1');
  });

  it('shows a busy, disabled button while the session is being created, and ignores a second click', async () => {
    let resolveGuest: (value: AuthResponse) => void = () => undefined;
    const guest = vi.spyOn(api.auth, 'guest').mockReturnValue(new Promise((r) => { resolveGuest = r; }));
    vi.spyOn(api.pages, 'create').mockResolvedValue(createdPage);
    const button = mount();

    await clickAndWait(button);
    const busy = buttonByText(view.container, 'Preparando tu sesión…');
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');

    await clickAndWait(busy);
    expect(guest).toHaveBeenCalledTimes(1);

    await act(async () => resolveGuest({ user: guestUser }));
    expect(push).toHaveBeenCalledWith('/editor/page-1');
  });

  it('explains a 429 and lets the person try again', async () => {
    const guest = vi.spyOn(api.auth, 'guest')
      .mockRejectedValueOnce(new ApiError(429, JSON.stringify({ error: 'Too many', code: 'THROTTLED' })))
      .mockResolvedValueOnce({ user: guestUser });
    vi.spyOn(api.pages, 'create').mockResolvedValue(createdPage);
    await clickAndWait(mount());

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('varias sesiones de invitado seguidas');
    expect(push).not.toHaveBeenCalled();

    const retry = buttonByText(view.container, 'Probar sin registrarse');
    expect(retry.disabled).toBe(false);
    await clickAndWait(retry);
    expect(guest).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(push).toHaveBeenCalledWith('/editor/page-1');
  });

  it('explains a full house (503 GUEST_CAPACITY)', async () => {
    vi.spyOn(api.auth, 'guest').mockRejectedValue(
      new ApiError(503, JSON.stringify({ error: 'Lleno', code: 'GUEST_CAPACITY' })),
    );
    await clickAndWait(mount());

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('demasiadas sesiones de invitado abiertas');
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a generic message for any other failure', async () => {
    vi.spyOn(api.auth, 'guest').mockRejectedValue(new TypeError('Failed to fetch'));
    await clickAndWait(mount());

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo empezar la sesión de invitado');
  });

  it('goes to the dashboard if the starter page cannot be created (the guest session exists)', async () => {
    vi.spyOn(api.auth, 'guest').mockResolvedValue({ user: guestUser });
    vi.spyOn(api.pages, 'create').mockRejectedValue(new ApiError(500, 'boom'));
    await clickAndWait(mount());

    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('never replaces a session the browser already has: goes to the dashboard', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(normalUser);
    const guest = vi.spyOn(api.auth, 'guest');
    await clickAndWait(mount('form'));

    expect(guest).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});

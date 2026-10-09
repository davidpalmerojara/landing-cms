import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import GuestBanner from '@/components/guest/GuestBanner';
import GuestSessionProvider from '@/components/guest/GuestSessionProvider';
import { api } from '@/lib/api';
import type { ApiUser } from '@/lib/api';
import { render, click, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText, field, guestUser, normalUser, typeInto } from './test-helpers';

let view: RenderResult;

function mount(user: ApiUser | null, onClaimed = vi.fn()) {
  view = render(
    <GuestSessionProvider user={user} onClaimed={onClaimed}>
      <GuestBanner />
    </GuestSessionProvider>,
  );
  return onClaimed;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T18:30:00Z'));
});

afterEach(() => {
  view.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GuestBanner', () => {
  it('says the session is temporary and how long is left', () => {
    mount(guestUser);

    const banner = view.container.querySelector('[role="region"]');
    expect(banner?.getAttribute('aria-label')).toBe('Sesión de invitado');
    expect(banner?.textContent).toContain('Sesión de invitado: lo que hagas se borra en 24 h.');
    expect(banner?.textContent).toContain('Caduca en 16 h');
  });

  it('rounds the time left up and flags a session about to expire', () => {
    mount({ ...guestUser, expires_at: '2026-10-09T18:50:00Z' });
    expect(view.container.textContent).toContain('Caduca en 1 h');
    view.unmount();

    mount({ ...guestUser, expires_at: '2026-10-09T18:00:00Z' });
    expect(view.container.textContent).toContain('Caduca de un momento a otro');
  });

  it('renders nothing for a normal account or without a user', () => {
    mount(normalUser);
    expect(view.container.querySelector('[role="region"]')).toBeNull();
    view.unmount();

    mount(null);
    expect(view.container.innerHTML).toBe('');
  });

  it('has a tap target of at least 44px for the claim action', () => {
    mount(guestUser);
    expect(buttonByText(view.container, 'Crear cuenta y guardarlo').className).toContain('min-h-11');
  });

  it('opens the claim dialog, and after claiming the banner is gone', async () => {
    vi.spyOn(api.auth, 'claimGuest').mockResolvedValue({ user: normalUser });
    let current: ApiUser = guestUser;
    const onClaimed = vi.fn((next: ApiUser) => { current = next; });
    mount(current, onClaimed);

    click(buttonByText(view.container, 'Crear cuenta y guardarlo'));
    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const form = view.container.querySelector('form') as HTMLFormElement;
    typeInto(field(form, 'Usuario'), 'ana');
    typeInto(field(form, 'Email'), 'ana@example.com');
    typeInto(field(form, 'Contraseña'), 'Str0ng-pass-123');
    typeInto(field(form, 'Confirmar contraseña'), 'Str0ng-pass-123');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    click(buttonByText(view.container, 'Continuar'));

    expect(onClaimed).toHaveBeenCalledWith(normalUser);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();

    // The page re-renders with the claimed user: the banner disappears
    view.rerender(
      <GuestSessionProvider user={current} onClaimed={onClaimed}>
        <GuestBanner />
      </GuestSessionProvider>,
    );
    expect(view.container.querySelector('[role="region"]')).toBeNull();
  });

  it('closes the claim dialog without claiming when cancelled', () => {
    const onClaimed = mount(guestUser);
    click(buttonByText(view.container, 'Crear cuenta y guardarlo'));
    click(buttonByText(view.container, 'Cancelar'));

    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(onClaimed).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="region"]')).not.toBeNull();
  });
});

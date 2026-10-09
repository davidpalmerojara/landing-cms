import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import MagicVerifyPage from '@/app/auth/magic/[token]/page';
import { api } from '@/lib/api';
import type { ApiUser, AuthResponse } from '@/lib/api';
import { render, click, type RenderResult } from '../mobile-editor/test-utils';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ token: 'magic-token' }),
}));

const user: ApiUser = {
  id: 'u1', email: 'ana@example.com', username: 'ana', avatar: '', created_at: '2026-10-01T10:00:00Z', is_guest: false, expires_at: null,
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
});

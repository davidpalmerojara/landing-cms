import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import JoinPage from '@/app/join/[token]/page';
import { api, ApiError } from '@/lib/api';
import { joinErrorKind } from '@/hooks/useJoinInvite';
import { normalUser } from '../guest/test-helpers';
import { render, type RenderResult } from '../mobile-editor/test-utils';
import { buttonByText } from '../guest/test-helpers';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ token: 'invite-token' }),
}));

async function renderPage(): Promise<RenderResult> {
  let view: RenderResult | undefined;
  await act(async () => {
    view = render(<JoinPage />);
  });
  if (!view) throw new Error('not rendered');
  return view;
}

const PAGE_ID = '11111111-1111-4111-8111-111111111111';

describe('JoinPage', () => {
  let view: RenderResult;

  beforeEach(() => {
    replace.mockReset();
  });

  afterEach(() => {
    view.unmount();
    vi.restoreAllMocks();
  });

  it('joins once and opens the editor of the shared page', async () => {
    const join = vi.spyOn(api.auth, 'join').mockResolvedValue({ page_id: PAGE_ID, user: normalUser });

    view = await renderPage();

    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith('invite-token');
    expect(replace).toHaveBeenCalledWith(`/editor/${PAGE_ID}`);
  });

  it('shows progress while joining', async () => {
    vi.spyOn(api.auth, 'join').mockReturnValue(new Promise(() => undefined));

    view = await renderPage();

    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Abriendo la página compartida');
  });

  it('an invalid or expired link (404) says so, without a retry button', async () => {
    vi.spyOn(api.auth, 'join').mockRejectedValue(new ApiError(404, JSON.stringify({ error: 'x', code: 'INVITE_INVALID' })));

    view = await renderPage();

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Este enlace no es válido');
    expect(view.container.querySelector('button')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('too many attempts (429) can be retried', async () => {
    const join = vi.spyOn(api.auth, 'join')
      .mockRejectedValueOnce(new ApiError(429, '{}'))
      .mockResolvedValue({ page_id: PAGE_ID, user: normalUser });

    view = await renderPage();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Demasiados intentos');

    await act(async () => { buttonByText(view.container, 'Reintentar').click(); });

    expect(join).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith(`/editor/${PAGE_ID}`);
  });

  it('no room for more guests (503)', async () => {
    vi.spyOn(api.auth, 'join').mockRejectedValue(new ApiError(503, JSON.stringify({ code: 'GUEST_CAPACITY' })));

    view = await renderPage();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('Ahora mismo no hay sitio');
  });

  it('classifies errors', () => {
    expect(joinErrorKind(new ApiError(404, '{}'))).toBe('invalid');
    expect(joinErrorKind(new ApiError(429, '{}'))).toBe('throttled');
    expect(joinErrorKind(new ApiError(503, '{}'))).toBe('capacity');
    expect(joinErrorKind(new ApiError(500, '{}'))).toBe('generic');
    expect(joinErrorKind(new Error('offline'))).toBe('generic');
  });
});

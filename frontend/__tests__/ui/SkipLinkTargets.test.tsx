import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordDisabledScreen from '@/components/auth/PasswordDisabledScreen';
import LandingPage from '@/components/marketing/LandingPage';
import NotFoundScreen from '@/components/ui/NotFoundScreen';
import JoinPage from '@/app/join/[token]/page';
import MagicVerifyPage from '@/app/auth/magic/[token]/page';
import { render, type RenderResult } from '../mobile-editor/test-utils';

vi.mock('@/components/providers/AppIntlProvider', () => ({
  useAppLocale: () => ({ locale: 'es', setLocale: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ token: 'abc' }),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('@/components/guest/GuestStartButton', () => ({ default: () => null }));
vi.mock('@/hooks/useJoinInvite', () => ({
  useJoinInvite: () => ({ state: { status: 'error', error: 'invalid' }, retry: vi.fn() }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { ...actual.api, auth: { ...actual.api.auth, magicVerify: vi.fn(() => new Promise(() => {})) } },
  };
});

let view: RenderResult;

afterEach(() => {
  view.unmount();
});

/** The skip link points at "#main-content": it must exist once, and be the page's one <main>. */
function expectOneMainThatTheSkipLinkReaches(container: HTMLElement) {
  const targets = container.querySelectorAll('#main-content');
  expect(targets).toHaveLength(1);
  expect(targets[0].tagName).toBe('MAIN');
  expect(container.querySelectorAll('main')).toHaveLength(1);
}

describe('APP3-002: the skip link lands on the one <main> of every page', () => {
  it('the 404 screen', () => {
    view = render(<NotFoundScreen />);
    expectOneMainThatTheSkipLinkReaches(view.container);
  });

  it('login and register frame', () => {
    view = render(<AuthLayout title="Iniciar sesión" subtitle="Hola"><p>form</p></AuthLayout>);
    expectOneMainThatTheSkipLinkReaches(view.container);
  });

  it('the screen after a magic link took over a password', () => {
    view = render(<PasswordDisabledScreen onContinue={vi.fn()} />);
    expectOneMainThatTheSkipLinkReaches(view.container);
  });

  it('the invite link page', () => {
    view = render(<JoinPage />);
    expectOneMainThatTheSkipLinkReaches(view.container);
  });

  it('the magic link page', async () => {
    await act(async () => {
      view = render(<MagicVerifyPage />);
    });
    expectOneMainThatTheSkipLinkReaches(view.container);
  });

  it('the landing: navigation and footer stay outside <main>', async () => {
    await act(async () => {
      view = render(<LandingPage />);
    });
    expectOneMainThatTheSkipLinkReaches(view.container);
    const main = view.container.querySelector('main') as HTMLElement;
    expect(main.querySelector('nav, footer')).toBeNull();
    expect(main.querySelector('h1')).not.toBeNull();
  });
});

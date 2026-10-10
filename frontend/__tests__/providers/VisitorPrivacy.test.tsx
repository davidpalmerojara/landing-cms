import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { render, click, type RenderResult } from '../mobile-editor/test-utils';

const refresh = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

let view: RenderResult;

const googleScripts = () => document.querySelectorAll('script[src*="accounts.google.com"]');

function clearLocaleCookie() {
  document.cookie = 'paxl-locale=; path=/; max-age=0';
}

beforeEach(() => {
  clearLocaleCookie();
  document.querySelectorAll('script[src*="accounts.google.com"]').forEach((script) => script.remove());
  refresh.mockReset();
  document.documentElement.lang = '';
});

afterEach(() => {
  view.unmount();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('D5 / QA-025: visiting the app stores nothing and contacts nobody', () => {
  it('mounting the providers does not write the language cookie', async () => {
    const { default: AppProviders } = await import('@/components/providers/AppProviders');

    view = render(<AppProviders initialLocale="en"><p>page</p></AppProviders>);

    expect(document.cookie).not.toContain('paxl-locale');
    // The language still reaches <html lang>, which the API client reads
    expect(document.documentElement.lang).toBe('en');
  });

  it('the cookie is written when the person switches language, and the server-rendered parts refresh', async () => {
    const { default: AppIntlProvider, useAppLocale } = await import('@/components/providers/AppIntlProvider');
    function Switch() {
      const { locale, setLocale } = useAppLocale();
      return <button onClick={() => setLocale('en')}>{locale}</button>;
    }
    view = render(<AppIntlProvider initialLocale="es"><Switch /></AppIntlProvider>);
    expect(document.cookie).not.toContain('paxl-locale');

    click(view.container.querySelector('button') as HTMLButtonElement);

    expect(document.cookie).toContain('paxl-locale=en');
    expect(document.documentElement.lang).toBe('en');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('the app providers do not load Google\'s script, even when a client id is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    vi.resetModules();
    const { default: AppProviders } = await import('@/components/providers/AppProviders');

    view = render(<AppProviders initialLocale="es"><p>a published page</p></AppProviders>);
    await act(async () => {});

    expect(googleScripts().length).toBe(0);
  });

  it('the Google button is what loads it (login and register render it)', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    vi.resetModules();
    const { default: AppProviders } = await import('@/components/providers/AppProviders');
    const { default: GoogleSignIn } = await import('@/components/auth/GoogleSignIn');

    view = render(
      <AppProviders initialLocale="es">
        <GoogleSignIn text="continue_with" onCredential={vi.fn()} onError={vi.fn()} />
      </AppProviders>,
    );
    await act(async () => {});

    expect(googleScripts().length).toBe(1);
  });

  it('without a client id nothing Google related is rendered at all', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');
    vi.resetModules();
    const { default: AppProviders } = await import('@/components/providers/AppProviders');
    const { default: GoogleSignIn } = await import('@/components/auth/GoogleSignIn');

    view = render(
      <AppProviders initialLocale="es">
        <GoogleSignIn text="continue_with" onCredential={vi.fn()} onError={vi.fn()} />
      </AppProviders>,
    );
    await act(async () => {});

    expect(googleScripts().length).toBe(0);
  });
});

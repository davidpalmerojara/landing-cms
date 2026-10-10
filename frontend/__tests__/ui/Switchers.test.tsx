import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import LandingPage from '@/components/marketing/LandingPage';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { click, render, type RenderResult } from '../mobile-editor/test-utils';

const setLocale = vi.hoisted(() => vi.fn());

vi.mock('@/components/providers/AppIntlProvider', () => ({
  useAppLocale: () => ({ locale: 'es', setLocale }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('@/components/guest/GuestStartButton', () => ({ default: () => null }));

let view: RenderResult;

afterEach(() => {
  view.unmount();
  setLocale.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('QA-100: the language and theme switchers', () => {
  it('the language switcher is a named group whose buttons are read in their own language', () => {
    view = render(<LocaleSwitcher />);

    const group = view.container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Idioma');
    const buttons = [...view.container.querySelectorAll('button')];
    expect(buttons.map((b) => [b.textContent, b.getAttribute('lang'), b.getAttribute('aria-pressed')])).toEqual([
      ['es', 'es', 'true'],
      ['en', 'en', 'false'],
    ]);
  });

  it('they are 44 px on touch screens', () => {
    view = render(<><LocaleSwitcher /><ThemeToggle /></>);

    for (const button of view.container.querySelectorAll('button')) {
      expect(button.className).toContain('pointer-coarse:min-h-11');
    }
  });

  it('choosing a language calls setLocale', () => {
    view = render(<LocaleSwitcher />);

    click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'en') as HTMLButtonElement);

    expect(setLocale).toHaveBeenCalledWith('en');
  });
});

describe('QA-120: deleting an account is acknowledged', () => {
  it('the landing says so after /?deleted=1', async () => {
    window.history.replaceState(null, '', '/?deleted=1');

    await act(async () => {
      view = render(<LandingPage />);
    });

    expect(view.container.querySelector('[role="status"]')?.textContent)
      .toBe('Tu cuenta y todo lo que contenía se han eliminado. Gracias por probar Paxl.');
  });

  it('and is silent on a normal visit', async () => {
    await act(async () => {
      view = render(<LandingPage />);
    });

    expect(view.container.querySelector('[role="status"]')).toBeNull();
  });
});

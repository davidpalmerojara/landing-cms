import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketingShell from '@/components/marketing/MarketingShell';
import LandingPage from '@/components/marketing/LandingPage';
import { click, keyDown, render, type RenderResult } from '../mobile-editor/test-utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pricing',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => <span data-testid="locale-switcher" /> }));
vi.mock('@/components/guest/GuestStartButton', () => ({ default: () => null }));

let view: RenderResult;

afterEach(() => {
  view.unmount();
});

const links = (root: ParentNode = view.container) => [...root.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);

describe('QA-015: a way to log in on a phone', () => {
  it('the shared header always has a link to /login, not only at sm and up', () => {
    view = render(<MarketingShell title="Precios"><p>x</p></MarketingShell>);

    const header = view.container.querySelector('header') as HTMLElement;
    const login = [...header.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/login');
    expect(login?.textContent).toBe('Iniciar sesión');
    expect(login?.className).not.toMatch(/\bhidden\b/);
  });

  it('the landing header always has a link to /login too', () => {
    view = render(<LandingPage />);

    const nav = view.container.querySelector('nav') as HTMLElement;
    const login = [...nav.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/login');
    expect(login?.textContent).toBe('Iniciar sesión');
    expect(login?.className).not.toMatch(/\bhidden\b/);
  });
});

describe('QA-058 / QA-015: the header menu below md', () => {
  it('is collapsed at first and opens with the links, theme and language', () => {
    view = render(<MarketingShell title="Precios"><p>x</p></MarketingShell>);
    const button = view.container.querySelector<HTMLButtonElement>('button[aria-controls]') as HTMLButtonElement;

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(view.container.querySelector(`#${button.getAttribute('aria-controls')}`)).toBeNull();

    click(button);

    const panel = view.container.querySelector(`#${button.getAttribute('aria-controls')}`) as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(links(panel)).toEqual([
      ['Inicio', '/'], ['Precios', '/pricing'], ['Nosotros', '/about'], ['Contacto', '/contact'],
    ]);
    expect(panel.querySelector('[data-testid="locale-switcher"]')).not.toBeNull();
    expect(panel.querySelector('[aria-label="Cambiar a modo claro"], [aria-label="Cambiar a modo oscuro"]')).not.toBeNull();
  });

  it('Escape closes it and returns focus to the button', () => {
    view = render(<MarketingShell title="Precios"><p>x</p></MarketingShell>);
    const button = view.container.querySelector<HTMLButtonElement>('button[aria-controls]') as HTMLButtonElement;
    click(button);

    keyDown(document, 'Escape');

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('marks the page you are on', () => {
    view = render(<MarketingShell title="Precios"><p>x</p></MarketingShell>);

    const current = [...view.container.querySelectorAll('nav a')].filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.getAttribute('href'))).toEqual(['/pricing']);
  });
});

describe('QA-099: the landing does not link to things that do not exist', () => {
  it('the footer has terms and contact, and no "Plantillas" link to the sign-up form', () => {
    view = render(<LandingPage />);

    const footer = view.container.querySelector('footer') as HTMLElement;
    expect(links(footer)).toEqual(expect.arrayContaining([['Términos', '/terms'], ['Contacto', '/contact']]));
    expect(footer.textContent).not.toContain('Plantillas');
    expect(footer.textContent).not.toContain('Soporte');
  });
});

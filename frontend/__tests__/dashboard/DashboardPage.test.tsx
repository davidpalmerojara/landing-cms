import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import DashboardPage from '@/app/dashboard/page';
import { ApiError, api } from '@/lib/api';
import type { ApiBillingPlan, ApiPageListItem, ApiSubscription, ApiUsage, PaginatedResponse } from '@/lib/api';
import { buttonByText, guestUser, normalUser, typeInto } from '../guest/test-helpers';
import { click, keyDown, render, type RenderResult } from '../mobile-editor/test-utils';

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));
// These need the app's locale provider, which is not what is under test
vi.mock('@/components/ui/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/dashboard/PagePreviewThumbnail', () => ({ default: () => null }));

let view: RenderResult;

function plan(overrides: Partial<ApiBillingPlan> = {}): ApiBillingPlan {
  return {
    id: 'plan-free', name: 'free', display_name: 'Free', price_monthly: '0', price_yearly: null, max_pages: 3,
    max_ai_generations_per_hour: 0, has_analytics: false, has_collaboration: false, has_custom_domain: false,
    has_ab_testing: false, remove_watermark: false, max_version_history: 5, ...overrides,
  };
}

function subscription(overrides: Partial<ApiBillingPlan> = {}): ApiSubscription {
  return {
    id: 's1', plan: plan(overrides), status: 'free', billing_cycle: null, current_period_start: null,
    current_period_end: null, cancel_at_period_end: false, trial_end: null, created_at: '2026-10-01T00:00:00Z',
  };
}

function pageItem(id: string, overrides: Partial<ApiPageListItem> = {}): ApiPageListItem {
  return {
    id, name: `Landing ${id}`, slug: `landing-${id}`, status: 'draft', block_count: 2, preview_blocks: [],
    owner_name: 'ana', is_shared: false, design_tokens: null,
    seo_title: '', seo_description: '', seo_canonical_url: '', og_title: '', og_description: '', og_image: '',
    og_type: 'website', noindex: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as ApiPageListItem;
}

function answer(items: ApiPageListItem[], count = items.length, next: string | null = null): PaginatedResponse<ApiPageListItem> {
  return { count, next, previous: null, results: items };
}

interface Setup {
  user?: typeof normalUser;
  pages?: PaginatedResponse<ApiPageListItem> | Error;
  plan?: Partial<ApiBillingPlan>;
  usage?: ApiUsage;
  billing?: boolean;
}

async function mount(setup: Setup = {}) {
  vi.spyOn(api.auth, 'me').mockResolvedValue(setup.user ?? normalUser);
  vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing: setup.billing ?? false });
  vi.spyOn(api.billing, 'subscription').mockResolvedValue({
    subscription: subscription(setup.plan),
    usage: setup.usage ?? { pages: 1, visible_pages: 1, published_pages: 0, blocks: 2 },
  });
  const pages = setup.pages ?? answer([pageItem('1')]);
  vi.spyOn(api.pages, 'list').mockImplementation(async () => {
    if (pages instanceof Error) throw pages;
    return pages;
  });
  await act(async () => {
    view = render(<DashboardPage />);
  });
  await act(async () => {});
}

const text = () => view.container.textContent ?? '';
const byLabel = (label: string) => view.container.querySelector<HTMLElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

afterEach(() => {
  view.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('dashboard, pages and totals', () => {
  it('QA-016: totals come from the server, not from the 20 pages that happen to be loaded', async () => {
    await mount({
      pages: answer([pageItem('1')], 45, 'next'),
      usage: { pages: 45, visible_pages: 45, published_pages: 12, blocks: 300 },
      plan: { max_pages: -1, name: 'pro', display_name: 'Pro' },
    });

    expect(text()).toContain('45 páginas');
    expect(text()).toContain('12 publicadas');
    expect(text()).toContain('300');
  });

  it('QA-016: "Cargar más páginas" follows the pagination', async () => {
    await mount({ pages: answer([pageItem('1')], 2, 'next') });
    expect(view.container.querySelectorAll('h2 a').length).toBe(1);
    vi.mocked(api.pages.list).mockResolvedValue(answer([pageItem('2')], 2, null));

    await act(async () => buttonByText(view.container, 'Cargar más páginas').click());

    expect(api.pages.list).toHaveBeenLastCalledWith({ page: 2, search: '' });
    expect(view.container.querySelectorAll('h2 a').length).toBe(2);
    expect(text()).not.toContain('Cargar más páginas');
  });

  it('QA-016: the search is sent to the server once the typing pauses', async () => {
    await mount();
    vi.useFakeTimers();
    const search = view.container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('no search box');

    typeInto(search, 'needle');
    expect(api.pages.list).not.toHaveBeenCalledWith({ page: 1, search: 'needle' });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(api.pages.list).toHaveBeenCalledWith({ page: 1, search: 'needle' });
  });

  it('QA-016: the search box has a label, not only a placeholder', async () => {
    await mount();

    const search = view.container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(view.container.querySelector(`label[for="${search?.id}"]`)?.textContent).toBe('Buscar páginas...');
  });

  it('QA-052: a failed load shows a translated error and a retry, never "no pages yet"', async () => {
    await mount({ pages: new ApiError(500, '{"error":"boom","code":"INTERNAL_ERROR"}') });

    expect(view.container.querySelector('[role="alert"] h2')?.textContent).toBe(
      'Algo ha fallado en el servidor. Inténtalo de nuevo en un momento.',
    );
    expect(text()).not.toContain('No hay páginas');
    expect(text()).not.toContain('API 500');
    expect(buttonByText(view.container, 'Reintentar')).toBeTruthy();
  });
});

describe('dashboard, plan usage', () => {
  it('QA-051: an unlimited plan says so instead of "-1"', async () => {
    await mount({
      plan: { max_pages: -1, name: 'pro', display_name: 'Pro' },
      usage: { pages: 4, visible_pages: 4, published_pages: 1, blocks: 8 },
    });

    expect(text()).toContain('Uso: 4 páginas (sin límite)');
    expect(text()).not.toMatch(/\/-1|-1 p/);
  });

  it('QA-051: pages shared with the user do not count against the limit', async () => {
    await mount({
      pages: answer([pageItem('1', { is_shared: true }), pageItem('2', { is_shared: true }), pageItem('3', { is_shared: true })]),
      usage: { pages: 0, visible_pages: 3, published_pages: 0, blocks: 6 },
    });

    expect(text()).toContain('Uso: 0/3 páginas');
  });

  it('QA-053: the plan-limit error appears inside the template dialog', async () => {
    await mount({ usage: { pages: 1, visible_pages: 1, published_pages: 0, blocks: 2 } });
    vi.spyOn(api.pages, 'create').mockRejectedValue(
      new ApiError(403, JSON.stringify({ error: 'plan_limit', message: 'x', upgrade_url: '/settings/billing' })),
    );
    click(buttonByText(view.container, 'Nueva página'));

    await act(async () => buttonByText(view.container, 'Crear página en blanco').click());

    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('[role="alert"]')?.textContent).toContain('límite de páginas');
  });

  it('QA-053: at the limit the new-page button is disabled and says why', async () => {
    await mount({ usage: { pages: 3, visible_pages: 3, published_pages: 0, blocks: 2 } });

    const button = buttonByText(view.container, 'Nueva página');
    expect(button.disabled).toBe(true);
    const note = view.container.querySelector(`#${button.getAttribute('aria-describedby')}`);
    expect(note?.textContent).toContain('límite de páginas');
  });

  it('D2: with payments off there is no upgrade button, and the limit message does not send anyone to Pro', async () => {
    await mount({ usage: { pages: 3, visible_pages: 3, published_pages: 0, blocks: 2 }, billing: false });

    expect(text()).not.toContain('Mejorar plan');
    expect(text()).not.toContain('Actualiza a Pro');
  });

  it('D2: with a Stripe test key the upgrade button is there', async () => {
    await mount({ billing: true });

    expect(text()).toContain('Mejorar plan');
  });
});

describe('dashboard, collaborators (D1, ADR-032)', () => {
  function openMenu(name: string) {
    click(byLabel(`Opciones para ${name}`) as HTMLElement);
    return document.querySelector('[role="menu"]') as HTMLElement;
  }
  const items = (menu: HTMLElement) => [...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);

  it('the owner can duplicate, unpublish and delete their published page', async () => {
    await mount({ pages: answer([pageItem('1', { status: 'published' })]) });

    expect(items(openMenu('Landing 1'))).toEqual(['Editar', 'Duplicar', 'Vista previa', 'Ver publicada', 'Despublicar', 'Eliminar']);
  });

  it('on a shared page those actions are left out, with an explanation', async () => {
    await mount({ pages: answer([pageItem('1', { status: 'published', is_shared: true, owner_name: 'marta' })]) });

    const menu = openMenu('Landing 1');

    expect(items(menu)).toEqual(['Editar', 'Vista previa', 'Ver publicada']);
    expect(menu.textContent).toContain('Solo marta puede duplicar, despublicar o eliminar esta página.');
  });

  it('QA-060: deleting asks in a dialog (not window.confirm) and deletes once confirmed', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await mount();
    vi.spyOn(api.pages, 'delete').mockResolvedValue(undefined);
    const menu = openMenu('Landing 1');
    click(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')[menu.querySelectorAll('[role="menuitem"]').length - 1]);

    const dialog = view.container.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Landing 1');
    expect(api.pages.delete).not.toHaveBeenCalled();

    await act(async () => buttonByText(dialog as HTMLElement, 'Eliminar').click());

    expect(api.pages.delete).toHaveBeenCalledWith('1');
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('dashboard, page menu keyboard (QA-060)', () => {
  it('Enter opens the menu on its first item, arrows move, Escape closes and returns focus to the button', async () => {
    await mount();
    const trigger = byLabel('Opciones para Landing 1') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    click(trigger);

    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items[0]);

    keyDown(menu, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    keyDown(menu, 'End');
    expect(document.activeElement).toBe(items[items.length - 1]);
    keyDown(menu, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);

    keyDown(menu, 'Escape');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('APP2-001: the menu is drawn outside the card, fixed over the page, so the card cannot clip it', async () => {
    await mount({ pages: answer([pageItem('1', { status: 'published' })]) });
    click(byLabel('Opciones para Landing 1') as HTMLElement);

    const menu = document.querySelector('[role="menu"]') as HTMLElement;

    expect(view.container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain('fixed');
    expect(menu.style.top).not.toBe('');
    expect(menu.style.left).not.toBe('');
  });

  it('APP2-001: a click on an item reaches the item (and only it), then the menu closes', async () => {
    await mount({ pages: answer([pageItem('1', { status: 'published' })]) });
    click(byLabel('Opciones para Landing 1') as HTMLElement);
    const menu = document.querySelector('[role="menu"]') as HTMLElement;

    click(menu.querySelector('[role="menuitem"]') as HTMLElement);

    expect(push).toHaveBeenCalledWith('/editor/1');
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('APP2-003: cancelling the delete dialog returns focus to the card menu button', async () => {
    await mount();
    const trigger = byLabel('Opciones para Landing 1') as HTMLButtonElement;
    click(trigger);
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    click(items[items.length - 1]);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);

    click(buttonByText(dialog, 'Cancelar'));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('APP2-003: after deleting the page, focus goes to the dashboard heading, not to the top of the page', async () => {
    await mount();
    vi.spyOn(api.pages, 'delete').mockResolvedValue(undefined);
    click(byLabel('Opciones para Landing 1') as HTMLElement);
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    click(items[items.length - 1]);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    await act(async () => buttonByText(dialog, 'Eliminar').click());
    await act(async () => {});

    expect(view.container.querySelector('h2 a')).toBeNull();
    expect(document.activeElement).toBe(view.container.querySelector('h1'));
  });

  it('a click anywhere else closes the menu', async () => {
    await mount();
    click(byLabel('Opciones para Landing 1') as HTMLElement);

    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });

    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});

describe('dashboard, dialogs over the sidebar (APP2-002)', () => {
  it('the template picker sits on the same layer as the other dialogs, above the sidebar', async () => {
    await mount();
    click(buttonByText(view.container, 'Nueva página'));

    const overlay = (document.querySelector('[role="dialog"]') as HTMLElement).parentElement as HTMLElement;
    const aside = view.container.querySelector('aside') as HTMLElement;

    expect(overlay.className).toContain('z-[100]');
    expect(aside.className).toContain('z-60');
  });
});

describe('dashboard, drawer (QA-059)', () => {
  it('the closed drawer is inert and the hamburger says it is collapsed', async () => {
    await mount();

    const aside = view.container.querySelector('aside') as HTMLElement;
    const hamburger = byLabel('Navegación principal') as HTMLButtonElement;
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    expect(hamburger.getAttribute('aria-controls')).toBe(aside.id);
  });

  it('opening it makes it reachable, Escape closes it and focus goes back to the hamburger', async () => {
    await mount();
    const aside = view.container.querySelector('aside') as HTMLElement;
    const hamburger = byLabel('Navegación principal') as HTMLButtonElement;

    click(hamburger);

    expect(aside.hasAttribute('inert')).toBe(false);
    expect(hamburger.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    keyDown(aside, 'Escape');

    expect(aside.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('QA-058: the drawer holds the theme switch for phones', async () => {
    await mount();

    const aside = view.container.querySelector('aside') as HTMLElement;
    expect(aside.querySelector('[aria-label="Cambiar a modo claro"], [aria-label="Cambiar a modo oscuro"]')).not.toBeNull();
  });
});

describe('dashboard, leaving a guest session (QA-061)', () => {
  it('asks before logging a guest out, and cancelling keeps the session', async () => {
    const logout = vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    await mount({ user: guestUser });

    click(buttonByText(view.container, 'Cerrar sesión'));

    const dialog = view.container.ownerDocument.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Perderás tus páginas');
    expect(logout).not.toHaveBeenCalled();

    click(buttonByText(dialog, 'Cancelar'));

    expect(view.container.ownerDocument.querySelector('[role="dialog"]')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('"Cerrar sesión y perder mis páginas" logs out', async () => {
    const logout = vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    await mount({ user: guestUser });
    click(buttonByText(view.container, 'Cerrar sesión'));
    const dialog = view.container.ownerDocument.querySelector('[role="dialog"]') as HTMLElement;

    await act(async () => buttonByText(dialog, 'Cerrar sesión y perder mis páginas').click());

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('a normal account logs out without a question', async () => {
    const logout = vi.spyOn(api.auth, 'logout').mockResolvedValue(undefined);
    await mount();

    await act(async () => buttonByText(view.container, 'Cerrar sesión').click());

    expect(logout).toHaveBeenCalledTimes(1);
    expect(view.container.ownerDocument.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('dashboard, without a session', () => {
  it('QA-099: sends the visitor to the login page, which brings them back to the dashboard', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError(401, '{"detail":"x"}'));
    vi.spyOn(api.features, 'get').mockResolvedValue({ custom_domains: false, billing: false });

    await act(async () => {
      view = render(<DashboardPage />);
    });
    await act(async () => {});

    expect(replace).toHaveBeenCalledWith('/login?next=%2Fdashboard');
  });
});

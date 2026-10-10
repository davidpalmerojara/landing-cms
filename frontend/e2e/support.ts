import { expect, test as base, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

/** Blocks in the SaaS template (the one guests start with), navbar to footer. */
export const SAAS_TEMPLATE_BLOCK_COUNT = 10;

const LOCALE_COOKIE = 'paxl-locale';

type Locale = 'es' | 'en';

interface ApiBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface ApiPage {
  id: string;
  slug: string;
  status: 'draft' | 'published';
  blocks: ApiBlock[];
}

/** The UI language is chosen by a cookie; set it explicitly instead of trusting the browser's. */
export async function setLocale(context: BrowserContext, baseURL: string, locale: Locale): Promise<void> {
  await context.addCookies([{ name: LOCALE_COOKIE, value: locale, url: baseURL }]);
}

/** `test` with the UI language fixed to Spanish, whatever the browser prefers. */
export const test = base.extend({
  // The callback is not called `use` so the React hooks lint rule does not mistake it for a hook
  context: async ({ context, baseURL }, provide) => {
    await setLocale(context, baseURL ?? '', 'es');
    await provide(context);
  },
});

/** A second, independent browser (own cookies, so a different person). */
export async function newPerson(browser: Browser, baseURL: string, locale: Locale = 'es'): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, locale: locale === 'es' ? 'es-ES' : 'en-US' });
  await setLocale(context, baseURL, locale);
  return context;
}

/** The page id in an editor URL (`/editor/<id>`). */
export function pageIdFromUrl(url: string): string {
  const id = new URL(url).pathname.split('/').filter(Boolean).pop();
  if (!id) throw new Error(`No page id in ${url}`);
  return id;
}

/** The page as the server has it (the session cookies of `page` authenticate the request). */
export async function fetchServerPage(page: Page, pageId: string): Promise<ApiPage> {
  const response = await page.request.get(`/api/pages/${pageId}/`);
  expect(response.ok(), `GET /api/pages/${pageId}/ answered ${response.status()}`).toBe(true);
  return (await response.json()) as ApiPage;
}

/** The canvas: one group that contains every block of the page. */
export function canvasOf(page: Page): Locator {
  return page.getByRole('group', { name: /^Lienzo de la página/ });
}

/**
 * One block of the canvas by its accessible name, e.g. `canvasBlock(page, 'Hero', 2, 10)`.
 * A selected block adds ", seleccionado" to its name; both states match.
 */
export function canvasBlock(page: Page, name: string, position: number, total: number): Locator {
  return page.getByRole('group', { name: new RegExp(`^Bloque ${name}, ${position} de ${total}(, seleccionado)?$`) });
}

/** Waits until the editor shows a page with `blockCount` blocks. */
export async function expectEditorReady(page: Page, blockCount: number): Promise<void> {
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
  await expect(canvasOf(page)).toHaveAccessibleName(new RegExp(`${blockCount} bloques$`));
}

/** The top bar tells the draft/published state of the page. */
export function topBarOf(page: Page): Locator {
  return page.getByRole('banner');
}

/** Presses Publicar and waits until the page is published (the bar says "Publicada"). */
export async function publishFromEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(topBarOf(page).getByText('Publicada', { exact: true })).toBeVisible();
}

/**
 * Records the types of the messages the page's collaboration socket receives.
 * Call it before the editor opens: it listens for the socket as it is created.
 * Use it as `await expect.poll(() => messages.has('user_joined')).toBe(true)`.
 */
export function watchCollabMessages(page: Page): { has: (type: string) => boolean } {
  const seen = new Set<string>();

  page.on('websocket', (socket) => {
    if (!socket.url().includes('/ws/pages/')) return;
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const message: unknown = JSON.parse(payload);
      if (typeof message === 'object' && message !== null && 'type' in message && typeof message.type === 'string') {
        seen.add(message.type);
      }
    });
  });

  return { has: (type) => seen.has(type) };
}


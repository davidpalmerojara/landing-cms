import { expect } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  expectEditorReady,
  fetchServerPage,
  pageIdFromUrl,
  publishFromEditor,
  setLocale,
  test,
} from './support';

test.describe('Guest path', () => {
  test('a visitor tries the editor, edits the hero, publishes, and the public page shows it', async ({ page, request }) => {
    const newTitle = `Titulo de prueba ${Date.now()}`;

    await page.goto('/');
    await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();

    // The editor opens with the SaaS template (navbar, hero, ... footer)
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
    await expect(page.getByRole('region', { name: 'Sesión de invitado' })).toBeVisible();
    const pageId = pageIdFromUrl(page.url());

    // Select the hero on the canvas and change its title in the inspector
    await canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await inspector.getByLabel('Título', { exact: true }).fill(newTitle);
    await expect(canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).getByRole('heading', { level: 1 })).toHaveText(newTitle);

    // Autosave (3 s debounce) reaches the server without pressing anything
    await expect.poll(async () => {
      const saved = await fetchServerPage(page, pageId);
      return saved.blocks.find((block) => block.type === 'hero')?.data.title;
    }, { message: 'the autosaved hero title reaches the server', timeout: 20_000 }).toBe(newTitle);

    await publishFromEditor(page);
    const published = await fetchServerPage(page, pageId);
    expect(published.status).toBe('published');

    // The public page, rendered in a browser...
    await page.goto(`/p/${published.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(newTitle);

    // ...and the server-rendered HTML, from a client that runs no JavaScript and has no session
    const html = await request.get(`/p/${published.slug}`);
    expect(html.status()).toBe(200);
    expect(await html.text()).toContain(newTitle);
  });

  test('the same path starts in English when the language cookie says so', async ({ page, context, baseURL }) => {
    await setLocale(context, baseURL ?? '', 'en');

    await page.goto('/');
    await page.getByRole('button', { name: 'Try it without signing up' }).first().click();

    await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('region', { name: 'Guest session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
  });
});

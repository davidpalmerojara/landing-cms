import { expect, type Page } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  expectEditorReady,
  fetchServerPage,
  pageIdFromUrl,
  test,
} from './support';

/** Starts a guest session and selects the hero: returns the page id and the inspector. */
async function openHeroInEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  const pageId = pageIdFromUrl(page.url());
  await canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  return { pageId, inspector };
}

async function serverHero(page: Page, pageId: string): Promise<Record<string, unknown>> {
  const saved = await fetchServerPage(page, pageId);
  return saved.blocks.find((block) => block.type === 'hero')?.data ?? {};
}

test.describe('Nothing typed is lost', () => {
  test('QA-003: leaving the editor right after typing keeps the edit', async ({ page }) => {
    const newTitle = `Antes de salir ${Date.now()}`;
    const { pageId, inspector } = await openHeroInEditor(page);

    await inspector.getByLabel('Título', { exact: true }).fill(newTitle);
    // Well inside the 3 s autosave delay
    await page.getByRole('link', { name: 'Ir al dashboard' }).click();

    await expect(page).not.toHaveURL(/\/editor\//);
    // The editor saved before navigating: the server has it now, no waiting
    expect((await serverHero(page, pageId)).title).toBe(newTitle);
  });

  test('QA-003: navigating away from the site right after typing keeps the edit', async ({ page }) => {
    const newTitle = `Pestaña cerrada ${Date.now()}`;
    const { pageId, inspector } = await openHeroInEditor(page);

    await inspector.getByLabel('Título', { exact: true }).fill(newTitle);
    // The tab leaves the app at once: the save goes out as a keepalive request
    await page.goto('about:blank');

    await expect.poll(async () => (await serverHero(page, pageId)).title, {
      message: 'the edit sent while leaving reaches the server',
      timeout: 10_000,
    }).toBe(newTitle);
  });

  test('QA-004: the server refuses one field: that field says why and every other edit still saves', async ({ page }) => {
    const newTitle = `Se guarda igual ${Date.now()}`;
    const { pageId, inspector } = await openHeroInEditor(page);
    const link = inspector.getByLabel('Enlace del Botón', { exact: true });

    await link.fill('javascript:alert(1)');
    await inspector.getByLabel('Título', { exact: true }).fill(newTitle);

    // The save names the refused field and its rule...
    await expect(page.locator('p').filter({ hasText: /No se ha podido guardar «Hero › Enlace del Botón»: Enlace no válido/ })).toBeVisible({ timeout: 15_000 });
    // ...the field itself says what is wrong...
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    await expect(inspector.getByText(/^Enlace no válido/)).toBeVisible();
    // ...and the rest of the page reached the server without it
    await expect.poll(async () => (await serverHero(page, pageId)).title, { timeout: 15_000 }).toBe(newTitle);
    expect((await serverHero(page, pageId)).buttonLink).not.toBe('javascript:alert(1)');

    // The usual mistake, a link without https://, is completed and saved
    await link.fill('example.com');
    await link.blur();
    await expect(link).toHaveValue('https://example.com');
    await expect.poll(async () => (await serverHero(page, pageId)).buttonLink, { timeout: 15_000 }).toBe('https://example.com');
    await expect(page.locator('p').filter({ hasText: /No se ha podido guardar/ })).toBeHidden();
  });

  test('QA-008: edits made offline are saved when the connection comes back', async ({ page, context }) => {
    const newTitle = `Sin red ${Date.now()}`;
    const { pageId, inspector } = await openHeroInEditor(page);

    await context.setOffline(true);
    await inspector.getByLabel('Título', { exact: true }).fill(newTitle);
    await expect(page.locator('p').filter({ hasText: /^Sin conexión\. Tus cambios se guardan en este navegador/ })).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
    await expect.poll(async () => (await serverHero(page, pageId)).title, {
      message: 'the offline edit is sent once the browser is back online',
      timeout: 20_000,
    }).toBe(newTitle);
    await expect(page.locator('p').filter({ hasText: /^Sin conexión\./ })).toBeHidden();
  });
});

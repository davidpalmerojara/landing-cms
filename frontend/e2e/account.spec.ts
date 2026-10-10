import { expect } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  canvasOf,
  expectEditorReady,
  fetchServerPage,
  pageIdFromUrl,
  publishFromEditor,
  test,
} from './support';

const PASSWORD = 'E2e-Passw0rd-9x!';

test.describe('Account path', () => {
  test('register, create a page from a template, add a block, publish, log out and back in', async ({ page }) => {
    const username = `e2e${Date.now()}`;

    // Register
    await page.goto('/register');
    await page.getByPlaceholder('Usuario').fill(username);
    await page.getByPlaceholder('Email').fill(`${username}@example.com`);
    await page.getByPlaceholder('••••••••').first().fill(PASSWORD);
    await page.getByPlaceholder('••••••••').nth(1).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Mis páginas', level: 1 })).toBeVisible();

    // New page from a template
    await page.getByRole('button', { name: 'Nueva página' }).click();
    const picker = page.getByRole('dialog', { name: 'Crear página' });
    await picker.getByRole('button', { name: /SaaS Landing/ }).click();
    await picker.getByRole('button', { name: 'Crear con plantilla' }).click();
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
    const pageId = pageIdFromUrl(page.url());

    // Add a block from the sidebar (Galería is not part of the template)
    await page.getByRole('complementary', { name: 'Componentes' }).getByRole('button', { name: 'Galería' }).click();
    await expect(canvasOf(page)).toHaveAccessibleName(/11 bloques$/);
    await expect(canvasBlock(page, 'Galería', 11, SAAS_TEMPLATE_BLOCK_COUNT + 1)).toBeVisible();
    await expect.poll(async () => (await fetchServerPage(page, pageId)).blocks.length, {
      message: 'the autosaved block reaches the server',
      timeout: 20_000,
    }).toBe(SAAS_TEMPLATE_BLOCK_COUNT + 1);

    await publishFromEditor(page);

    // Log out from the dashboard...
    await page.getByRole('link', { name: 'Ir al dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // ...and log in again
    await page.getByPlaceholder('Usuario').fill(username);
    await page.getByPlaceholder('••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // The page is listed, still published, with its 11 blocks
    const card = page.getByRole('heading', { name: 'SaaS Landing', level: 2 });
    await expect(card).toBeVisible();
    // The dashboard card upper-cases the status
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await expect(page.getByText('11 bloques', { exact: true })).toBeVisible();
    expect((await fetchServerPage(page, pageId)).status).toBe('published');
  });
});

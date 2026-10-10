import { expect, type Page } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, pageIdFromUrl, test } from './support';

/** A phone held upright: Quick Edit (CLAUDE.md §5) */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function startGuestInQuickEdit(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('list', { name: 'Bloques de la página' }).getByRole('listitem')).toHaveCount(SAAS_TEMPLATE_BLOCK_COUNT);
  return pageIdFromUrl(page.url());
}

function heroCard(page: Page) {
  return page.getByRole('listitem', { name: /^Hero:/ });
}

test.describe('Quick Edit, QA round 2', () => {
  test.use(PHONE);

  test('a toast never covers the open publish sheet (MOBILE2-004)', async ({ page }) => {
    await startGuestInQuickEdit(page);

    // A toast with a button: duplicate from the card's menu
    await heroCard(page).getByRole('button', { name: /^Opciones/ }).tap();
    await page.getByRole('menuitem', { name: 'Duplicar' }).tap();
    const toast = page.locator('[data-variant]').filter({ hasText: 'Bloque duplicado' });
    await expect(toast).toBeVisible();

    await page.getByRole('button', { name: 'Publicar página' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Publicar página' });
    const publish = sheet.getByRole('button', { name: 'Publicar', exact: true });
    await expect(publish).toBeVisible();

    const toastBox = await toast.boundingBox();
    const sheetBox = await sheet.boundingBox();
    const publishBox = await publish.boundingBox();
    if (!toastBox || !sheetBox || !publishBox) throw new Error('missing boxes');
    // Over the dimmed toolbar, clear of the sheet and its button
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(sheetBox.y + 8);
    expect(toastBox.y + toastBox.height).toBeLessThan(publishBox.y);
    await expect(toast).toHaveAttribute('data-variant', 'success');
    await page.screenshot({ path: process.env.E2E_SHOTS ? `${process.env.E2E_SHOTS}/toast-over-publish-sheet.png` : undefined });
  });

  test('deleting asks without a keyboard shortcut, and the back button answers the question (MOBILE2-006, MOBILE2-007)', async ({ page }) => {
    await startGuestInQuickEdit(page);
    const editorUrl = page.url();

    await heroCard(page).getByRole('button', { name: /^Opciones/ }).tap();
    await page.getByRole('menuitem', { name: 'Eliminar' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Eliminar bloque' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('botón Deshacer');
    await expect(dialog).not.toContainText(/Ctrl|⌘/);

    await page.goBack();
    await expect(dialog).toBeHidden();
    expect(page.url()).toBe(editorUrl);
    await expect(page.getByRole('list', { name: 'Bloques de la página' }).getByRole('listitem')).toHaveCount(SAAS_TEMPLATE_BLOCK_COUNT);
  });

  test('the guest account dialog closes with back instead of leaving the editor (MOBILE2-007)', async ({ page }) => {
    await startGuestInQuickEdit(page);
    const editorUrl = page.url();

    await page.getByRole('button', { name: 'Crear cuenta' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.goBack();
    await expect(dialog).toBeHidden();
    expect(page.url()).toBe(editorUrl);
  });

  test('after an edit the status says it is not saved yet, then saves (MOBILE2-012)', async ({ page }) => {
    await startGuestInQuickEdit(page);
    await heroCard(page).getByText('Hero', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Editar bloque' });
    await sheet.getByLabel('Título', { exact: true }).fill(`Pendiente ${Date.now()}`);
    await sheet.getByRole('button', { name: 'Listo' }).tap();

    await expect(page.getByRole('status').filter({ hasText: 'Sin guardar' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible({ timeout: 15_000 });
  });
});

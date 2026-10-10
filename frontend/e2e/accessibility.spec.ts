import { expect } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, canvasBlock, expectEditorReady, test } from './support';

test.describe('Accessibility smoke', () => {
  test('the editor has landmarks and the canvas is operable with the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);

    // Landmarks and a skip link
    await expect(page.getByRole('link', { name: 'Ir al contenido principal' })).toBeAttached();
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Componentes' })).toBeVisible();

    const total = SAAS_TEMPLATE_BLOCK_COUNT;
    const hero = canvasBlock(page, 'Hero', 2, total);
    const stats = canvasBlock(page, 'Estadísticas', 3, total);
    const inspector = page.getByRole('complementary', { name: 'Inspector' });

    // A block takes focus, and the arrow keys walk the canvas
    await hero.focus();
    await expect(hero).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(stats).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(hero).toBeFocused();

    // Enter selects the block: its properties open in the inspector
    await expect(inspector.getByText('Nada seleccionado')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(inspector.getByLabel('Título', { exact: true })).toBeVisible();
    await expect(inspector.getByText('Nada seleccionado')).toBeHidden();

    // Escape clears the selection
    await page.keyboard.press('Escape');
    await expect(inspector.getByText('Nada seleccionado')).toBeVisible();
  });
});

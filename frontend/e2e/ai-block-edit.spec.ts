import { expect } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, expectEditorReady, test, watchCollabMessages } from './support';

/**
 * COLLAB2-001 / MOBILE2-001: selecting a block takes its lock for this
 * editor's socket, and the AI edit of that block must count as ours, not
 * as "someone else is editing this block". Unit tests checked each side on
 * its own; this runs both against the real server.
 */
test.describe('AI edit of a block', () => {
  test('editing the selected block with AI works while this editor holds its lock', async ({ page }) => {
    const messages = watchCollabMessages(page);

    // Guests get Pro features, so the editor opens the real-time socket
    await page.goto('/');
    await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
    await expect.poll(() => messages.has('connected'), { message: 'the socket is connected' }).toBe(true);

    const hero = page.getByRole('group', { name: /^Bloque Hero, \d+ de \d+/ });
    await hero.click();
    await expect.poll(() => messages.has('lock_acquired'), { message: 'selecting the block took its lock' }).toBe(true);

    await hero.getByRole('button', { name: 'Generar con IA' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar con IA' });
    await expect(dialog).toBeVisible();

    const answer = page.waitForResponse((response) => response.url().includes('/edit-ai/'));
    await dialog.getByRole('textbox', { name: 'Editar con IA' }).fill('Hazlo más profesional');
    await dialog.getByRole('button', { name: 'Enviar instrucción' }).click();
    expect((await answer).status()).toBe(200);
    await expect(dialog.getByText(/Otra persona está editando/)).toHaveCount(0);
  });
});

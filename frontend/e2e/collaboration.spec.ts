import { expect } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  canvasOf,
  expectEditorReady,
  newPerson,
  pageIdFromUrl,
  test,
  watchCollabMessages,
} from './support';

test.describe('Collaboration', () => {
  test('a block added by an invited person shows up for the owner without reloading', async ({ page, browser, baseURL }) => {
    const ownerMessages = watchCollabMessages(page);

    // The owner starts as a guest (guests get Pro features, which real-time editing needs)
    await page.goto('/');
    await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
    const pageId = pageIdFromUrl(page.url());
    await expect.poll(() => ownerMessages.has('connected'), { message: 'the owner socket is connected' }).toBe(true);

    // Share > create an invite link
    await page.getByRole('button', { name: 'Compartir' }).click();
    const dialog = page.getByRole('dialog', { name: 'Compartir página' });
    await dialog.getByRole('button', { name: 'Crear enlace de invitación' }).click();
    const inviteLink = await dialog.getByRole('textbox', { name: 'Enlace de invitación' }).inputValue();
    expect(inviteLink).toContain('/join/');
    // Escape, not the close button: at 1280x720 a guest's share dialog is taller than the viewport
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // A second person, in their own browser context, opens the link
    const guestContext = await newPerson(browser, baseURL ?? '');
    try {
      const guest = await guestContext.newPage();
      const guestMessages = watchCollabMessages(guest);
      await guest.goto(inviteLink);

      // Both are on the same page
      await expectEditorReady(guest, SAAS_TEMPLATE_BLOCK_COUNT);
      expect(pageIdFromUrl(guest.url())).toBe(pageId);
      await expect.poll(() => guestMessages.has('connected'), { message: 'the invited socket is connected' }).toBe(true);
      await expect.poll(() => ownerMessages.has('user_joined'), { message: 'the owner is told someone joined' }).toBe(true);

      // The second person adds a block...
      await guest.getByRole('complementary', { name: 'Componentes' }).getByRole('button', { name: 'Galería' }).click();
      await expect(canvasOf(guest)).toHaveAccessibleName(/11 bloques$/);

      // ...and the owner sees it, without reloading
      await expect(canvasOf(page)).toHaveAccessibleName(/11 bloques$/);
      await expect(canvasBlock(page, 'Galería', 11, SAAS_TEMPLATE_BLOCK_COUNT + 1)).toBeVisible();
    } finally {
      await guestContext.close();
    }
  });
});

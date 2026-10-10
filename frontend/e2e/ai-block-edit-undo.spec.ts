import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, expectEditorReady, fetchServerPage, pageIdFromUrl, test, watchCollabMessages } from './support';

/**
 * MOBILE2-002: the AI edit is written by the server, which bumps the page
 * version. The editor must take that block and version as its sync base:
 * otherwise the next save gets 409 VERSION_CONFLICT and the merge turns the
 * undo step into the AI text, so undoing the edit never sticks.
 */

async function heroTitleOnServer(page: Page, pageId: string): Promise<string> {
  const server = await fetchServerPage(page, pageId);
  const hero = server.blocks.find((block) => block.type === 'hero');
  return String(hero?.data.title ?? '');
}

/** Opens a guest editor with the real-time socket and returns the page id. */
async function openGuestEditor(page: Page): Promise<string> {
  const messages = watchCollabMessages(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  await expect.poll(() => messages.has('connected'), { message: 'the socket is connected' }).toBe(true);
  return pageIdFromUrl(page.url());
}

/** Every PUT of the page the editor sends, by status. */
function watchSaves(page: Page, pageId: string): number[] {
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (response.request().method() === 'PUT' && response.url().endsWith(`/api/pages/${pageId}/`)) {
      statuses.push(response.status());
    }
  });
  return statuses;
}

async function editHeroWithAiThenUndo(page: Page, pageId: string, saves: number[]) {
  const before = await heroTitleOnServer(page, pageId);

  const hero = page.getByRole('group', { name: /^Bloque Hero, \d+ de \d+/ });
  await hero.click();
  await hero.getByRole('button', { name: 'Generar con IA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar con IA' });
  const answer = page.waitForResponse((response) => response.url().includes('/edit-ai/'));
  await dialog.getByRole('textbox', { name: 'Editar con IA' }).fill('Hazlo más corto');
  await dialog.getByRole('button', { name: 'Enviar instrucción' }).click();
  expect((await answer).status()).toBe(200);

  const aiTitle = await heroTitleOnServer(page, pageId);
  expect(aiTitle).not.toBe(before);
  await expect(hero.getByText(aiTitle)).toBeVisible();

  // Close the popover and undo the AI edit from the keyboard
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const undoSaved = page.waitForResponse((response) =>
    response.request().method() === 'PUT' && response.url().endsWith(`/api/pages/${pageId}/`));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(hero.getByText(before)).toBeVisible();
  expect((await undoSaved).status()).toBe(200);

  await expect.poll(() => heroTitleOnServer(page, pageId), { message: 'the undo reached the server' }).toBe(before);
  await page.reload();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  await expect(page.getByRole('group', { name: /^Bloque Hero, \d+ de \d+/ }).getByText(before)).toBeVisible();
  expect(saves.filter((status) => status === 409), 'no save was refused as a version conflict').toEqual([]);
}

test.describe('Undoing an AI block edit (MOBILE2-002)', () => {
  test('the undo is saved with the version the AI edit left, and survives a reload', async ({ page }) => {
    const pageId = await openGuestEditor(page);
    const saves = watchSaves(page, pageId);
    await editHeroWithAiThenUndo(page, pageId, saves);
  });

  test('a response without the page version makes the editor fetch the page, and the undo still sticks', async ({ page }) => {
    const pageId = await openGuestEditor(page);
    const saves = watchSaves(page, pageId);
    // An older server: the answer does not say which page version it left
    await page.route('**/edit-ai/', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      delete body.page_version;
      delete body.version;
      await route.fulfill({ response, json: body });
    });
    const refetched = page.waitForResponse((response) =>
      response.request().method() === 'GET' && response.url().endsWith(`/api/pages/${pageId}/`));
    await editHeroWithAiThenUndo(page, pageId, saves);
    expect((await refetched).ok()).toBe(true);
  });
});

import { expect, type Browser, type BrowserContext, type Locator, type Page, type Route } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasOf,
  expectEditorReady,
  fetchServerPage,
  newPerson,
  pageIdFromUrl,
  test,
  watchCollabMessages,
} from './support';

/**
 * Two people on one page, each in their own browser context (QA round 1):
 * a restore must not duplicate a block someone was editing (QA-012), and a
 * block someone else holds cannot be taken from the layers panel (QA-011).
 */

interface Pair {
  owner: Page;
  guest: Page;
  guestContext: BrowserContext;
  pageId: string;
}

/** The owner starts as a guest (Pro features) and a second person joins with an invite link. */
async function openTogether(owner: Page, browser: Browser, baseURL: string): Promise<Pair> {
  const ownerMessages = watchCollabMessages(owner);
  await owner.goto('/');
  await owner.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(owner, SAAS_TEMPLATE_BLOCK_COUNT);
  const pageId = pageIdFromUrl(owner.url());
  await expect.poll(() => ownerMessages.has('connected')).toBe(true);

  await owner.getByRole('button', { name: 'Compartir' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Compartir página' });
  await dialog.getByRole('button', { name: 'Crear enlace de invitación' }).click();
  const inviteLink = await dialog.getByRole('textbox', { name: 'Enlace de invitación' }).inputValue();
  await owner.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const guestContext = await newPerson(browser, baseURL);
  const guest = await guestContext.newPage();
  const guestMessages = watchCollabMessages(guest);
  await guest.goto(inviteLink);
  await expectEditorReady(guest, SAAS_TEMPLATE_BLOCK_COUNT);
  await expect.poll(() => guestMessages.has('connected')).toBe(true);
  await expect.poll(() => ownerMessages.has('user_joined')).toBe(true);
  return { owner, guest, guestContext, pageId };
}

/** A canvas block by its type label, wherever it is. */
function blockNamed(page: Page, label: string): Locator {
  return page.getByRole('group', { name: new RegExp(`^Bloque ${label}, \\d+ de \\d+`) });
}

/** A state-changing API call with the session of `page` (the Origin check wants the app's origin). */
async function post(page: Page, baseURL: string, path: string, data: Record<string, unknown> = {}) {
  const response = await page.request.post(path, { data, headers: { Origin: baseURL } });
  expect(response.ok(), `POST ${path} answered ${response.status()}`).toBe(true);
  return response.json() as Promise<Record<string, unknown>>;
}

test.describe('Collaboration integrity', () => {
  test('QA-012: restoring a version while the other person has an unsaved edit does not duplicate the block', async ({ page, browser, baseURL }) => {
    const base = baseURL ?? '';
    const { owner, guest, guestContext, pageId } = await openTogether(page, browser, base);
    try {
      const version = await post(owner, base, `/api/pages/${pageId}/versions/`, { label: 'orig' });

      // The guest's saves wait at the network until we let them go
      const held: Route[] = [];
      let holding = true;
      await guest.route('**/api/pages/*/', async (route) => {
        if (holding && route.request().method() === 'PUT') held.push(route);
        else await route.continue();
      });

      // The guest edits the call to action; the autosave PUT is held
      await blockNamed(guest, 'Llamada a la acción').click();
      const edited = `Editado por el invitado ${Date.now()}`;
      await guest.getByRole('complementary', { name: 'Inspector' }).getByLabel(/^Título principal$/i).fill(edited);
      await expect.poll(() => held.length, { message: 'the guest autosave is on its way', timeout: 15_000 }).toBeGreaterThan(0);

      // Meanwhile the owner restores the version
      await post(owner, base, `/api/pages/${pageId}/versions/${String(version.id)}/restore/`);

      // The guest's save arrives late: 409, merge, save again
      holding = false;
      for (const route of held) await route.continue();

      await expect.poll(async () => {
        const saved = await fetchServerPage(owner, pageId);
        return saved.blocks.find((block) => block.type === 'cta')?.data.title;
      }, { message: 'the guest edit is merged into the restored page', timeout: 20_000 }).toBe(edited);

      const server = await fetchServerPage(owner, pageId);
      const ids = server.blocks.map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(server.blocks).toHaveLength(SAAS_TEMPLATE_BLOCK_COUNT);
      expect(server.blocks.filter((block) => block.type === 'cta')).toHaveLength(1);
      await expect(canvasOf(guest)).toHaveAccessibleName(new RegExp(`${SAAS_TEMPLATE_BLOCK_COUNT} bloques$`));
      await expect(canvasOf(owner)).toHaveAccessibleName(new RegExp(`${SAAS_TEMPLATE_BLOCK_COUNT} bloques$`));
    } finally {
      await guestContext.close();
    }
  });

  test('QA-011: a block someone else is editing cannot be selected from the layers panel', async ({ page, browser, baseURL }) => {
    const { owner, guest, guestContext } = await openTogether(page, browser, baseURL ?? '');
    try {
      // The guest takes the hero
      await blockNamed(guest, 'Hero').click();
      await expect(blockNamed(guest, 'Hero')).toHaveAccessibleName(/seleccionado$/);
      const ownerHero = blockNamed(owner, 'Hero');
      await expect(ownerHero).toHaveAccessibleName(/bloqueado, lo está editando/);

      // The owner goes around the canvas: the layers panel, by mouse and by keyboard
      await owner.getByRole('tab', { name: 'Capas' }).click();
      // The layer says who holds the block (COLLAB2-005)
      const layer = owner.locator('[data-layer-item]').filter({ hasText: /^Hero/ });
      await expect(layer).toContainText('bloqueado, lo está editando');
      await layer.click();
      await expect(owner.getByText(/está editando este bloque$/).first()).toBeVisible();
      await layer.focus();
      await owner.keyboard.press('Enter');
      // Nor with the Delete shortcut
      await owner.keyboard.press('Delete');

      await expect(layer).not.toHaveAttribute('aria-current', 'true');
      await expect(ownerHero).not.toHaveAccessibleName(/seleccionado/);
      await expect(owner.getByRole('complementary', { name: 'Inspector' }).getByLabel('Título', { exact: true })).toHaveCount(0);
      await expect(owner.getByRole('dialog')).toHaveCount(0);
      // The guest still has it
      await expect(blockNamed(guest, 'Hero')).toHaveAccessibleName(/seleccionado$/);
    } finally {
      await guestContext.close();
    }
  });
});

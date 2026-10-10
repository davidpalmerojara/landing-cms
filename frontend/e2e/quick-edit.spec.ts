import { expect, type Page } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, fetchServerPage, pageIdFromUrl, setLocale, test } from './support';

/** A phone held upright: Quick Edit (CLAUDE.md §5) */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** Records every Content-Security-Policy violation the page runs into. */
async function watchPolicyViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

/** Starts a guest from the landing page and waits for Quick Edit's block list. */
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

/** Waits until the server has `title` as the hero's title (the autosave reached it). */
async function expectSavedHeroTitle(page: Page, pageId: string, title: string) {
  await expect.poll(async () => {
    const saved = await fetchServerPage(page, pageId);
    return saved.blocks.find((block) => block.type === 'hero')?.data.title;
  }, { message: 'the autosaved hero title reaches the server', timeout: 20_000 }).toBe(title);
}

test.describe('Quick Edit on a phone', () => {
  test.use(PHONE);

  test('edit, publish, edit again and publish the changes; back closes the sheet (QA-014, QA-064, QA-066)', async ({ page }) => {
    const violations = await watchPolicyViolations(page);
    const pageId = await startGuestInQuickEdit(page);
    const editorUrl = page.url();

    // The guest notice is one line (QA-104)
    const banner = page.getByRole('region', { name: 'Sesión de invitado' });
    await expect(banner).toBeVisible();
    expect((await banner.boundingBox())?.height ?? 999).toBeLessThanOrEqual(56);

    // Tap the hero: its sheet opens
    await heroCard(page).getByText('Hero', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Editar bloque' });
    await expect(sheet).toBeVisible();
    const title = sheet.getByLabel('Título', { exact: true });

    // 16 px at least, or iOS zooms the page in on focus (QA-064)
    expect(await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

    const first = `Primera ${Date.now()}`;
    await title.fill(first);

    // The phone's back button closes the sheet and stays in the editor (QA-066)
    await page.goBack();
    await expect(sheet).toBeHidden();
    expect(page.url()).toBe(editorUrl);
    await expectSavedHeroTitle(page, pageId, first);

    // Publish the draft
    await page.getByRole('button', { name: 'Publicar página' }).tap();
    const publishSheet = page.getByRole('dialog', { name: 'Publicar página' });
    await publishSheet.getByRole('button', { name: 'Publicar', exact: true }).tap();
    await expect(page.getByText('Página publicada', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await fetchServerPage(page, pageId)).status).toBe('published');

    // Edit after publishing: the toolbar says there are unpublished changes
    await heroCard(page).getByText('Hero', { exact: true }).tap();
    const second = `Segunda ${Date.now()}`;
    await sheet.getByLabel('Título', { exact: true }).fill(second);
    await sheet.getByRole('button', { name: 'Listo' }).tap();
    await expectSavedHeroTitle(page, pageId, second);
    const pending = page.getByRole('button', { name: 'Publicar cambios (hay cambios sin publicar)' });
    await expect(pending).toBeVisible();

    // ...and the sheet publishes them (QA-014)
    await pending.tap();
    await page.getByRole('dialog', { name: 'Publicar cambios' }).getByRole('button', { name: 'Publicar cambios' }).tap();
    await expect(page.getByRole('button', { name: 'Página publicada' })).toBeVisible();

    // The closed sheet has given its history entry back
    await expect.poll(() => page.evaluate(() => Boolean((history.state as { paxlSheet?: boolean } | null)?.paxlSheet))).toBe(false);
    const { slug } = await fetchServerPage(page, pageId);
    await page.goto(`/p/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(second);

    expect(await violations()).toEqual([]);
  });

  test('undo in the toolbar takes back an edit, and the image field opens the media library (QA-067, QA-063)', async ({ page }) => {
    await startGuestInQuickEdit(page);
    const undo = page.getByRole('button', { name: 'Deshacer' });
    await expect(undo).toBeDisabled();

    await heroCard(page).getByText('Hero', { exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Editar bloque' });
    const title = sheet.getByLabel('Título', { exact: true });
    const original = await title.inputValue();
    await title.fill('Un título que voy a deshacer');

    await sheet.getByRole('button', { name: 'Cambiar imagen' }).tap();
    // A guest cannot upload, and the library says so; it opens above the sheet
    await expect(page.getByText('Subir imágenes necesita una cuenta')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Subir imágenes necesita una cuenta')).toBeHidden();
    await expect(sheet).toBeVisible();

    await sheet.getByRole('button', { name: 'Listo' }).tap();
    await expect(undo).toBeEnabled();
    await undo.tap();
    await expect(heroCard(page)).toHaveAccessibleName(`Hero: ${original}`);
  });
});

test.describe('Which editor each screen gets (QA-022)', () => {
  test('a phone in landscape stays in Quick Edit', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'es-ES', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await setLocale(context, baseURL ?? '', 'es');
    const page = await context.newPage();
    await startGuestInQuickEdit(page);
    await expect(page.getByRole('group', { name: /^Lienzo de la página/ })).toHaveCount(0);
    await context.close();
  });

  test('a tablet gets the full editor', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: 'es-ES', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });
    await setLocale(context, baseURL ?? '', 'es');
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
    await expect(page.getByRole('group', { name: /^Lienzo de la página/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Bloques de la página' })).toHaveCount(0);
    await context.close();
  });
});

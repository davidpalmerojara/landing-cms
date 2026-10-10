import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, expectEditorReady, pageIdFromUrl, test, topBarOf } from './support';

/**
 * The editor's top bar at common widths: the real-time notice and its button
 * are never hidden under the view switcher (COLLAB2-002), the page name and the
 * draft badge stay readable (QA-083), and on touch screens every control is at
 * least 44 px (EDITOR2-003, ADR-043). Layout needs a real browser.
 */

async function openGuestEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
}

const LONG_NAME = 'Landing de verano para la tienda online de cerámica';

/** Gives the open page a long name on the server and reloads the editor. */
async function renamePage(page: Page, baseURL: string) {
  const pageId = pageIdFromUrl(page.url());
  const response = await page.request.get(`/api/pages/${pageId}/`);
  const server = (await response.json()) as { version: number; blocks: unknown[] };
  const saved = await page.request.put(`/api/pages/${pageId}/`, {
    data: { name: LONG_NAME, blocks: server.blocks, version: server.version },
    headers: { Origin: baseURL },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.reload();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
}

/** Whether a click at the centre of `locator` reaches it (nothing drawn on top, not clipped away). */
async function isReachable(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && (hit === element || element.contains(hit));
  });
}

for (const width of [1280, 1440]) {
  test.describe(`top bar at ${width} px`, () => {
    test.use({ viewport: { width, height: 850 } });

    test('the real-time notice and "Reconectar" are visible and clickable (COLLAB2-002), the page name is readable (QA-083)', async ({ page, baseURL }) => {
      // The server refuses the real-time socket with an error: the editor gives up and says so
      await page.routeWebSocket(/\/ws\/pages\//, (socket) => socket.close({ code: 4500, reason: 'e2e' }));
      await openGuestEditor(page);
      await renamePage(page, baseURL!);

      const reconnect = topBarOf(page).getByRole('button', { name: 'Reconectar' });
      await expect(reconnect).toBeVisible();
      expect(await isReachable(reconnect)).toBe(true);

      const name = topBarOf(page).locator(`span[title="${LONG_NAME}"]`);
      const shown = await name.evaluate((element) => element.getBoundingClientRect().width);
      // At 1280 it used to be cut to about 8 letters (~80 px)
      expect(shown, 'the page name has room for more than a few words').toBeGreaterThanOrEqual(200);
      expect(await isReachable(topBarOf(page).getByText('Borrador', { exact: true }))).toBe(true);
    });
  });
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
  test.describe(`top bar on a ${viewport.width}×${viewport.height} touch screen`, () => {
    test.use({ viewport, hasTouch: true });

    test('every control is at least 44 px and none is covered (EDITOR2-003, QA-083)', async ({ page }) => {
      await openGuestEditor(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

      const buttons = topBarOf(page).getByRole('button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(8);
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (!(await button.isVisible())) continue;
        const name = (await button.getAttribute('aria-label')) ?? (await button.innerText());
        const box = await button.boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
        expect(await isReachable(button), `${name} is not covered`).toBe(true);
      }
      expect(await isReachable(topBarOf(page).getByText('Borrador', { exact: true }))).toBe(true);
    });
  });
}

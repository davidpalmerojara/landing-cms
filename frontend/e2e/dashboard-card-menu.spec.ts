import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support';

/**
 * Dashboard, QA round 2 batch D: the page-card menu is drawn above the cards
 * and every item can be reached with a real click (APP2-001), keyboard focus
 * comes back to the menu button after a confirmation (APP2-003), and the
 * sidebar cannot be clicked through a dialog (APP2-002).
 */

async function signUp(page: Page, baseURL: string): Promise<void> {
  const name = `menu${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await page.request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function createPage(page: Page, baseURL: string, name: string, publish: boolean): Promise<void> {
  const created = await page.request.post('/api/pages/', {
    data: {
      name,
      language: 'es',
      blocks: [{ id: crypto.randomUUID(), type: 'cta', order: 0, data: { title: 'Hola', subtitle: '', buttonText: 'Ir', buttonLink: '#' }, styles: {} }],
    },
    headers: { Origin: baseURL },
  });
  expect(created.ok(), await created.text()).toBe(true);
  if (!publish) return;
  const { id } = (await created.json()) as { id: string };
  const published = await page.request.post(`/api/pages/${id}/publish/`, { headers: { Origin: baseURL } });
  expect(published.ok(), await published.text()).toBe(true);
}

/** The element at the middle of `target` is `target` itself or something inside it (nothing covers it). */
async function isReachable(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && element.contains(hit);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Card menu at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('APP2-001: every item of a published page\'s menu is visible and a click reaches it', async ({ page, baseURL }) => {
      await signUp(page, baseURL ?? '');
      await createPage(page, baseURL ?? '', 'Tarjeta inferior', false);
      await createPage(page, baseURL ?? '', 'Tarjeta con menú', true);
      await page.goto('/dashboard');

      await page.getByRole('button', { name: 'Opciones para Tarjeta con menú' }).click();
      const menu = page.getByRole('menu', { name: 'Opciones para Tarjeta con menú' });
      const items = menu.getByRole('menuitem');
      await expect(items).toHaveCount(6);

      for (let index = 0; index < 6; index += 1) {
        const item = items.nth(index);
        await item.scrollIntoViewIfNeeded();
        await expect(item).toBeInViewport({ ratio: 1 });
        expect(await isReachable(item), `item ${index} is covered by something else`).toBe(true);
      }

      // A real mouse click on "Eliminar" opens the confirmation, it does not open another page's editor
      await items.last().click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('dialog', { name: /Eliminar/ })).toBeVisible();
    });

    test('APP2-003: cancelling the confirmation puts keyboard focus back on the card\'s menu button', async ({ page, baseURL }) => {
      await signUp(page, baseURL ?? '');
      await createPage(page, baseURL ?? '', 'Tarjeta foco', false);
      await page.goto('/dashboard');

      const trigger = page.getByRole('button', { name: 'Opciones para Tarjeta foco' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}

test('APP2-002: the sidebar is behind the "Nueva página" dialog and cannot be clicked through it', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUp(page, baseURL ?? '');
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Nueva página' }).click();
  await expect(page.getByRole('dialog', { name: 'Crear página' })).toBeVisible();

  const logout = page.getByRole('button', { name: 'Cerrar sesión' });
  expect(await isReachable(logout), 'the sidebar is on top of the dialog backdrop').toBe(false);
});

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  canvasOf,
  expectEditorReady,
  pageIdFromUrl,
  publishFromEditor,
  test,
  topBarOf,
} from './support';

/**
 * Launch batch F3, interface fixes that only a real browser and the real stack can prove:
 * dialogs of the top bar inside the screen (UX-001), undo and redo buttons (UX-004), the
 * editor load error with a retry (UX-002), the landing warm-up (DEPLOY-005), revoking
 * invite links (SEC-005), the unverified-email notice (C5), the top bar on an iPad
 * landscape (MOBILE-002) and 44 px inspector controls on touch (MOBILE-003).
 */

async function openGuestEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
}

/** The dialog's box lies fully inside the window (a clipped one starts above the screen). */
async function expectInsideWindow(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'the dialog has a box').not.toBeNull();
  expect(box!.y, 'top edge').toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'bottom edge').toBeLessThanOrEqual(viewport!.height);
  expect(box!.x, 'left edge').toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, 'right edge').toBeLessThanOrEqual(viewport!.width);
}

test.describe('desktop editor', () => {
  test('UX-001: the share dialog and the unpublish confirmation are not clipped by the top bar', async ({ page }) => {
    await openGuestEditor(page);

    await topBarOf(page).getByRole('button', { name: 'Compartir', exact: true }).click();
    const share = page.getByRole('dialog', { name: 'Compartir página' });
    await expectInsideWindow(page, share);
    await expect(share.getByRole('heading', { name: 'Compartir página' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(share).toBeHidden();

    await publishFromEditor(page);
    // The "published" note sits over the menu until it is closed
    await topBarOf(page).getByRole('button', { name: 'Cerrar' }).click();
    await topBarOf(page).getByRole('button', { name: 'Más opciones de publicación' }).click();
    await page.getByRole('button', { name: 'Despublicar', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '¿Despublicar la página?' });
    await expectInsideWindow(page, confirm);
    await expect(confirm.getByRole('heading')).toBeInViewport();
  });

  test('UX-004: undo and redo are buttons, enabled only when they can do something', async ({ page }) => {
    await openGuestEditor(page);
    const undo = topBarOf(page).getByRole('button', { name: /^Deshacer/ });
    const redo = topBarOf(page).getByRole('button', { name: /^Rehacer/ });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    const hero = canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT);
    const before = await hero.getByRole('heading', { level: 1 }).innerText();
    await hero.click();
    await page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Título', { exact: true }).fill('Título con deshacer');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Título con deshacer');
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(before);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Título con deshacer');
  });

  test('UX-002: a gateway error on opening the editor is explained, never printed, and can be retried', async ({ page }) => {
    await openGuestEditor(page);
    const pageId = pageIdFromUrl(page.url());

    let failing = true;
    await page.route(new RegExp(`/api/pages/${pageId}/$`), async (route) => {
      if (failing && route.request().method() === 'GET') {
        await route.fulfill({ status: 502, contentType: 'text/html', body: '<html><h1>502 Bad Gateway</h1>Application failed to respond</html>' });
      } else {
        await route.continue();
      }
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Error al cargar' })).toBeVisible();
    await expect(page.getByText('El servidor ha tenido un problema.')).toBeVisible();
    await expect(page.getByText('puede tardar hasta un minuto en despertar')).toBeVisible();
    await expect(page.getByText('502 Bad Gateway')).toHaveCount(0);
    await expect(page.getByText('API 502')).toHaveCount(0);

    failing = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  });

  test('SEC-005: revoking the invite links makes the link stop working', async ({ page, browser, baseURL }) => {
    await openGuestEditor(page);
    await topBarOf(page).getByRole('button', { name: 'Compartir', exact: true }).click();
    const share = page.getByRole('dialog', { name: 'Compartir página' });
    await share.getByRole('button', { name: 'Crear enlace de invitación' }).click();
    const link = await share.getByLabel('Enlace de invitación').inputValue();
    const token = link.split('/join/')[1];
    expect(token).toBeTruthy();

    const join = async () => {
      const visitor = await browser.newContext({ baseURL });
      try {
        return (await visitor.request.post('/api/auth/join/', { data: { token }, headers: { Origin: baseURL! } })).status();
      } finally {
        await visitor.close();
      }
    };
    expect(await join(), 'the link works before it is revoked').toBeLessThan(300);

    await share.getByRole('button', { name: 'Revocar todos los enlaces' }).click();
    await expect(share.getByText('Enlaces revocados.')).toBeVisible();
    await expect(share.getByLabel('Enlace de invitación')).toHaveCount(0);

    expect(await join(), 'the link is dead after it is revoked').toBeGreaterThanOrEqual(400);
  });
});

test('DEPLOY-005: the landing wakes the backend through /api/healthz/', async ({ page }) => {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/healthz/');
  await page.goto('/');
  expect((await response).status()).toBe(200);
});

test('C5: an account with an unverified email is told its published pages are limited, and can ask for the link', async ({ page, baseURL }) => {
  const headers = { Origin: baseURL ?? '' };
  const name = `ver${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const registered = await page.request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers,
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const created = await page.request.post('/api/pages/', {
    data: { name: 'Sin verificar', blocks: [{ id: crypto.randomUUID(), type: 'hero', order: 0, data: { title: 'Hola' }, styles: {} }] },
    headers,
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/editor/${id}`);
  await expect(canvasOf(page)).toHaveAccessibleName(/1 bloque$/);
  const banner = page.getByRole('region', { name: 'Verificación del email' });
  await expect(banner).toContainText('Tu email aún no está verificado');

  await banner.getByRole('button', { name: 'Verificar email' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Verificar con un enlace?' });
  await expect(confirm).toContainText('se desactiva la contraseña');
  await confirm.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(banner.getByRole('status')).toContainText(`Te hemos enviado un enlace a ${name}@example.com`);
});

test.describe('iPad landscape (1024×768, touch)', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test('MOBILE-002: the "Cambios sin publicar" chip is whole, not covered by the tools', async ({ page }) => {
    await openGuestEditor(page);
    await publishFromEditor(page);
    const hero = canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT);
    await hero.click();
    await page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Título', { exact: true }).fill('Cambio tras publicar');

    const chip = topBarOf(page).getByText('Cambios sin publicar', { exact: true });
    await expect(chip).toBeVisible();
    const reachesWholeChip = await chip.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hitAt = (x: number) => {
        const hit = document.elementFromPoint(x, box.top + box.height / 2);
        return hit !== null && (hit === element || element.contains(hit));
      };
      return hitAt(box.left + 2) && hitAt(box.right - 2);
    });
    expect(reachesWholeChip, 'both ends of the chip are on top').toBe(true);
  });
});

test.describe('tablet inspector (768×1024, touch)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('MOBILE-003: the controls of a list item are 44 px', async ({ page }) => {
    await openGuestEditor(page);
    await page.getByRole('group', { name: /^Bloque Características,/ }).first().click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const controls = [
      inspector.getByRole('button', { name: /^Mover .* abajo/ }).first(),
      inspector.getByRole('button', { name: /^Eliminar / }).first(),
      inspector.getByRole('button', { name: /^Añadir / }).first(),
    ];
    for (const control of controls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      const name = (await control.getAttribute('aria-label')) ?? (await control.innerText());
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
    }
  });
});

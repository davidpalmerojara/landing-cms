import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import {
  SAAS_TEMPLATE_BLOCK_COUNT,
  canvasBlock,
  canvasOf,
  expectEditorReady,
  test,
} from './support';

/**
 * The full editor on tablets and touch screens (QA-022, decision D4, ADR-043):
 * finger pan and pinch on the canvas, tap and double tap, long-press and
 * handle drags, components dragged out of the sidebar, panels that open over
 * the canvas instead of squeezing it. Fingers are real touch events (Chrome
 * DevTools Protocol), so the browser's own touch handling is part of the test.
 */

interface Point {
  x: number;
  y: number;
}

/** The canvas has fitted itself to the viewport: the whole frame is in view and stays put. */
async function frameFits(page: Page): Promise<boolean> {
  const [viewBox, frameBox] = await Promise.all([
    page.locator('[data-canvas-viewport]').boundingBox(),
    page.locator('[data-canvas-frame]').boundingBox(),
  ]);
  if (!viewBox || !frameBox) return false;
  return frameBox.x >= viewBox.x && frameBox.x + frameBox.width <= viewBox.x + viewBox.width;
}

async function startGuestEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  // The canvas re-fits while the layout settles (fonts, banners): measure blocks after that
  await expect.poll(() => frameFits(page)).toBe(true);
  await page.waitForTimeout(300);
}

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** One or more fingers: each list is the path of one finger, all moving together. */
async function fingers(cdp: CDPSession, paths: Point[][], { holdMs = 0, stepMs = 16 } = {}): Promise<void> {
  const at = (step: number) => paths.map((path, id) => ({ id, ...path[Math.min(step, path.length - 1)] }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  if (holdMs) await new Promise((resolve) => setTimeout(resolve, holdMs));
  const steps = Math.max(...paths.map((p) => p.length));
  for (let step = 1; step < steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(step) });
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** `count` evenly spaced points from `from` to `to`. */
function line(from: Point, to: Point, count = 12): Point[] {
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / count,
    y: from.y + ((to.y - from.y) * i) / count,
  }));
}

const zoomLabel = (page: Page) => page.locator('[data-canvas-controls] span').first();
const blockNames = (page: Page) => canvasOf(page).locator('[data-block-focusable]').evaluateAll(
  (els) => els.map((el) => (el.getAttribute('aria-label') ?? '').split(',')[0]),
);

test.describe('Full editor on a landscape tablet (1024×768, touch)', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test('QA-022: the canvas fits, pans with one finger and pinch-zooms without zooming the page', async ({ page }) => {
    await startGuestEditor(page);
    const cdp = await page.context().newCDPSession(page);
    const viewport = page.locator('[data-canvas-viewport]');

    // "Fit" shows the whole desktop frame: nothing clipped at the right (EDITOR-014)
    expect(await frameFits(page)).toBe(true);

    // One finger, starting on a block, pans the canvas and selects nothing
    const hero = canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT);
    const heroTop = (await hero.boundingBox())!.y;
    const start = await center(viewport);
    await fingers(cdp, [line(start, { x: start.x, y: start.y - 200 })]);
    await expect.poll(async () => (await hero.boundingBox())!.y).toBeLessThan(heroTop - 150);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeHidden();

    // Two fingers spread apart: the canvas zooms in, the page itself does not
    const before = parseInt((await zoomLabel(page).textContent()) ?? '0', 10);
    await fingers(cdp, [
      line({ x: start.x - 40, y: start.y }, { x: start.x - 160, y: start.y }),
      line({ x: start.x + 40, y: start.y }, { x: start.x + 160, y: start.y }),
    ]);
    await expect.poll(async () => parseInt((await zoomLabel(page).textContent()) ?? '0', 10)).toBeGreaterThan(before * 2);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });

  test('QA-022: tap selects (the inspector opens over the canvas), double tap edits the text', async ({ page }) => {
    await startGuestEditor(page);
    const hero = canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT);
    const title = hero.locator('h1').first();

    const point = await center(title);
    await page.touchscreen.tap(point.x, point.y);
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText('Bloque 2 de 10');

    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(point.x, point.y);
    await expect(hero.locator('[contenteditable="true"]')).toBeFocused();

    // Closing the inspector ends the selection and gives the canvas back
    await page.keyboard.press('Escape');
    await inspector.getByRole('button', { name: 'Cerrar el inspector' }).tap();
    await expect(inspector).toBeHidden();
  });

  test('QA-022: a long press picks a block up and drops it where the finger goes', async ({ page }) => {
    await startGuestEditor(page);
    const cdp = await page.context().newCDPSession(page);
    const stats = canvasBlock(page, 'Estadísticas', 3, SAAS_TEMPLATE_BLOCK_COUNT);
    const statsBox = (await stats.boundingBox())!;
    const from = { x: statsBox.x + statsBox.width / 2, y: statsBox.y + 40 };
    const heroBox = (await canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).boundingBox())!;

    await fingers(cdp, [line(from, { x: from.x, y: heroBox.y + 10 })], { holdMs: 700 });

    await expect.poll(async () => {
      const names = await blockNames(page);
      return names.indexOf('Bloque Estadísticas') < names.indexOf('Bloque Hero');
    }).toBe(true);
  });

  test('QA-022: a component dragged by finger from the sidebar lands on the canvas', async ({ page }) => {
    await startGuestEditor(page);
    const cdp = await page.context().newCDPSession(page);
    const tile = page.getByRole('button', { name: 'Preguntas frecuentes', exact: true });
    const from = await center(tile);
    const target = await center(canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT));

    // Sideways first (towards the canvas): that is a drag, up or down would scroll the list
    await fingers(cdp, [[...line(from, { x: from.x + 120, y: from.y }, 6), ...line({ x: from.x + 120, y: from.y }, target, 12)]]);

    await expect(canvasOf(page)).toHaveAccessibleName(/11 bloques$/);
  });

  test('QA-022/QA-039: the toolbar of the selected block has 44 px targets and moves it without dragging', async ({ page }) => {
    await startGuestEditor(page);
    const stats = canvasBlock(page, 'Estadísticas', 3, SAAS_TEMPLATE_BLOCK_COUNT);
    const statsBox = (await stats.boundingBox())!;
    await page.touchscreen.tap(statsBox.x + statsBox.width / 2, statsBox.y + 40);

    const up = page.getByRole('button', { name: 'Subir Estadísticas' });
    // Once the toolbar's appear animation is over
    await expect.poll(async () => {
      const box = (await up.boundingBox())!;
      return Math.min(box.width, box.height);
    }).toBeGreaterThanOrEqual(43.5);

    await up.tap();
    await expect(canvasBlock(page, 'Estadísticas', 2, SAAS_TEMPLATE_BLOCK_COUNT)).toBeVisible();
  });

  test('EDITOR2-004: the inspector opening over the canvas does not cover the selected block\'s toolbar', async ({ page }) => {
    await startGuestEditor(page);
    const hero = canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT);
    const heroBox = (await hero.boundingBox())!;
    await page.touchscreen.tap(heroBox.x + heroBox.width / 2, heroBox.y + heroBox.height / 2);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();

    const remove = hero.locator('[data-block-toolbar]').getByRole('button', { name: /^Eliminar/ });
    await expect.poll(() => remove.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && (hit === element || element.contains(hit));
    }), { message: 'Eliminar is not under the inspector' }).toBe(true);
  });
});

test.describe('Full editor on a portrait tablet (768×1024, touch)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('QA-022: the panels open over the canvas instead of squeezing it to 320 px', async ({ page }) => {
    await startGuestEditor(page);
    const viewport = page.locator('[data-canvas-viewport]');
    expect((await viewport.boundingBox())!.width).toBeGreaterThan(700);

    const sidebar = page.getByRole('complementary', { name: 'Componentes' });
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: 'Bloques', exact: true }).tap();
    await expect(sidebar).toBeVisible();

    // A tap on a component adds it at the end and closes the panel
    await sidebar.getByRole('button', { name: 'Preguntas frecuentes', exact: true }).tap();
    await expect(canvasOf(page)).toHaveAccessibleName(/11 bloques$/);
    await expect(sidebar).toBeHidden();
    // The new block is selected: the inspector opens over the canvas
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    expect((await viewport.boundingBox())!.width).toBeGreaterThan(700);
  });
});

test.describe('Canvas and media library on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('QA-084: the tablet frame is 768 px wide inside, like a tablet', async ({ page }) => {
    await startGuestEditor(page);
    await page.getByRole('button', { name: 'Vista tablet' }).click();
    await expect.poll(() => page.locator('[data-canvas-frame]').evaluate((el) => el.clientWidth)).toBe(768);
  });

  test('QA-039: at 50% zoom the toolbar buttons stay at least 28 px', async ({ page }) => {
    await startGuestEditor(page);
    const zoomOut = page.getByRole('button', { name: 'Alejar' });
    while (parseInt((await zoomLabel(page).textContent()) ?? '0', 10) > 50) await zoomOut.click();
    await canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).click();
    const duplicate = page.getByRole('button', { name: 'Duplicar' }).first();
    await expect.poll(async () => {
      const box = (await duplicate.boundingBox())!;
      return Math.min(box.width, box.height);
    }).toBeGreaterThanOrEqual(27.5);
  });

  test('QA-020/QA-021: the media library is a centred modal dialog, not a strip inside the inspector', async ({ page }) => {
    await startGuestEditor(page);
    await canvasBlock(page, 'Hero', 2, SAAS_TEMPLATE_BLOCK_COUNT).click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const imageButton = inspector.locator('#field-backgroundImage');
    await imageButton.click();

    const library = page.getByRole('dialog', { name: 'Biblioteca de medios' });
    await expect(library).toBeVisible();
    const box = (await library.boundingBox())!;
    expect(box.width).toBeGreaterThan(600);
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(40);
    await expect(library.getByRole('button', { name: 'Cerrar' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(library).toBeHidden();
    await expect(imageButton).toBeFocused();
  });
});

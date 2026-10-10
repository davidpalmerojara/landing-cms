import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { canvasBlock, expectEditorReady, fetchServerPage, test } from './support';

/**
 * SEC3-001: a page saved before the https-only image rule can still hold an `http://` image.
 * The server refuses to be sent it again, so every autosave used to fail and the page could never
 * be edited. The API cannot create such a page any more, so the test writes the old value straight
 * into the suite's SQLite file, as a page from before the rule would have it.
 */

const SQLITE_PATH = process.env.E2E_SQLITE_PATH ?? path.resolve(__dirname, '../../backend/e2e.sqlite3');
const LEGACY_IMAGE = 'http://images.example.com/legacy.png';

/** Rewrites the stored image of every block of `pageId` (sqlite3 is in Python's standard library). */
function storeLegacyImage(pageId: string): void {
  const script = [
    'import sqlite3, sys',
    'db, page_id, old, new = sys.argv[1:5]',
    'con = sqlite3.connect(db, timeout=20)',
    "cur = con.execute('update pages_block set data = replace(data, ?, ?) where page_id in (?, ?)', (old, new, page_id, page_id.replace('-', '')))",
    'con.commit()',
    "sys.exit(0 if cur.rowcount > 0 else 3)",
  ].join('\n');
  execFileSync('python3', ['-I', '-c', script, SQLITE_PATH, pageId, 'https://images.example.com/legacy.png', LEGACY_IMAGE]);
}

async function signUp(page: Page, baseURL: string): Promise<void> {
  const name = `legacy${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await page.request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test('SEC3-001: a page that holds a legacy http:// image can still be edited and saved', async ({ page, baseURL }) => {
  await signUp(page, baseURL ?? '');
  const created = await page.request.post('/api/pages/', {
    data: {
      name: 'Imagen antigua',
      blocks: [
        { id: crypto.randomUUID(), type: 'hero', order: 0, data: { title: 'Título antiguo', backgroundImage: 'https://images.example.com/legacy.png' }, styles: {} },
        { id: crypto.randomUUID(), type: 'cta', order: 1, data: { title: 'Final', buttonText: 'Ir', buttonLink: '#' }, styles: {} },
      ],
    },
    headers: { Origin: baseURL ?? '' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  storeLegacyImage(id);
  const stored = await fetchServerPage(page, id);
  expect(stored.blocks[0].data.backgroundImage).toBe(LEGACY_IMAGE);

  await page.goto(`/editor/${id}`);
  await expectEditorReady(page, 2);
  await canvasBlock(page, 'Hero', 1, 2).click();
  const newTitle = `Editado ${Date.now()}`;
  await page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Título', { exact: true }).fill(newTitle);

  // The edit reaches the server although the old image is refused...
  await expect.poll(async () => (await fetchServerPage(page, id)).blocks[0].data.title, { timeout: 20_000 }).toBe(newTitle);
  // ...which no longer holds the refused value, and the editor says what was left out
  expect((await fetchServerPage(page, id)).blocks[0].data.backgroundImage).not.toBe(LEGACY_IMAGE);
  await expect(page.locator('p').filter({ hasText: /No se ha podido guardar «Hero › Imagen de Fondo»/ })).toBeVisible();
});

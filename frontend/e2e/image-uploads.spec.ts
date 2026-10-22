import { expect, type Page } from '@playwright/test';
import { canvasBlock, test } from './support';

/**
 * ADR-049, through the real stack (browser -> Next rewrite -> Daphne -> database):
 * - MOBILE-001: a 4000 px phone-sized photo is made smaller in the browser and passes;
 * - CODE-001 / DEPLOY-001: the image is stored in the database and served at /media/...
 *   with its detected type, a year of caching, an ETag and a sandbox;
 * - PERF-002: on the published page, a gallery below the first blocks is lazy;
 * - SEC: a body over the limit is refused before the server reads it.
 */

const BACKEND = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8101'}`;

async function signUp(page: Page, baseURL: string): Promise<void> {
  const name = `img${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await page.request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

function block(type: string, order: number, data: Record<string, unknown>) {
  return { id: crypto.randomUUID(), type, order, data, styles: {} };
}

/** A 4000x3000 JPEG full of detail (several MB, like a phone photo), drawn in the browser. */
async function bigPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(4000, 3000);
    // Gradients with grain: heavy at full size, like a photo, and much lighter once scaled down
    let seed = 7;
    const grain = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 81) - 40;
    };
    for (let y = 0; y < 3000; y += 1) {
      for (let x = 0; x < 4000; x += 1) {
        const i = (y * 4000 + x) * 4;
        pixels.data[i] = 64 + (x / 4000) * 128 + grain();
        pixels.data[i + 1] = 64 + (y / 3000) * 128 + grain();
        pixels.data[i + 2] = 96 + grain();
        pixels.data[i + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

test.use({ viewport: { width: 1440, height: 900 } });

test('a phone-sized photo is resized in the browser, stored in the database and served with long caching', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const origin = baseURL ?? '';
  await signUp(page, origin);
  const headers = { Origin: origin };

  const created = await page.request.post('/api/pages/', {
    data: { name: 'Fotos', blocks: [block('hero', 0, { title: 'Hola' })] },
    headers,
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/editor/${id}`);
  await canvasBlock(page, 'Hero', 1, 1).click();
  await page.getByRole('complementary', { name: 'Inspector' }).locator('#field-backgroundImage').click();
  const library = page.getByRole('dialog', { name: 'Biblioteca de medios' });
  await expect(library).toBeVisible();

  const photo = await bigPhoto(page);
  expect(photo.length).toBeGreaterThan(5 * 1024 * 1024);

  const uploadRequest = page.waitForRequest((request) => request.url().endsWith('/api/assets/') && request.method() === 'POST');
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith('/api/assets/') && response.request().method() === 'POST');
  await library.locator('input[type="file"]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: photo });

  // MOBILE-001: what travels is the redraw, not the 5+ MB original
  const answer = await uploadResponse;
  // The file part of a multipart body is not exposed to the test; its declared length is
  const sentBytes = Number((await (await uploadRequest).allHeaders())['content-length'] ?? 0);
  expect(sentBytes).toBeGreaterThan(10_000);
  expect(sentBytes).toBeLessThan(5 * 1024 * 1024);
  expect(answer.status(), await answer.text()).toBe(201);
  const asset = (await answer.json()) as { url: string; width: number; height: number; mime_type: string; size: number };
  expect(asset).toMatchObject({ width: 1600, height: 1200, mime_type: 'image/webp' });
  expect(asset.url).toMatch(/^\/media\/assets\/[0-9a-f]{32}\.webp$/);

  // The thumbnail loads from the database through the frontend's /media rewrite
  const thumbnail = library.locator(`img[src="${asset.url}"]`);
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1600);

  const served = await page.request.get(asset.url);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/webp');
  expect(served.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(served.headers()['x-content-type-options']).toBe('nosniff');
  expect(served.headers()['content-security-policy']).toBe("default-src 'none'; sandbox");
  expect((await served.body()).length).toBe(asset.size);
  const etag = served.headers()['etag'];
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
  const revalidated = await page.request.get(asset.url, { headers: { 'If-None-Match': etag } });
  expect(revalidated.status()).toBe(304);

  // PERF-002: a published page loads the hero's image at once and the gallery's lazily
  const published = await page.request.post('/api/pages/', {
    data: {
      name: 'Publicada con fotos',
      blocks: [
        block('hero', 0, { title: 'Arriba', backgroundImage: asset.url }),
        block('features', 1, { title: 'Medio', features: [{ title: 'A', description: 'B' }] }),
        block('gallery', 2, { title: 'Abajo', columns: '3', images: [{ src: asset.url, alt: 'Foto subida' }] }),
      ],
    },
    headers,
  });
  expect(published.ok(), await published.text()).toBe(true);
  const { id: publishedId, slug } = (await published.json()) as { id: string; slug: string };
  expect((await page.request.post(`/api/pages/${publishedId}/publish/`, { headers })).ok()).toBe(true);

  const html = await (await page.request.get(`/p/${slug}`)).text();
  expect(html).toMatch(new RegExp(`<link[^>]*rel="preload"[^>]*href="${asset.url}"`));
  await page.goto(`/p/${slug}`);
  const galleryImage = page.getByRole('img', { name: 'Foto subida' });
  await expect(galleryImage).toHaveAttribute('loading', 'lazy');
  await galleryImage.scrollIntoViewIfNeeded();
  await expect.poll(() => galleryImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1600);
});

test('a body over the limit is refused before the server reads it (SEC upload requirement 4)', async ({ request }) => {
  const response = await request.post(`${BACKEND}/api/assets/`, {
    headers: { 'Content-Type': 'application/octet-stream' },
    data: Buffer.alloc(7 * 1024 * 1024),
  });
  expect(response.status()).toBe(413);
  expect(((await response.json()) as { code: string }).code).toBe('REQUEST_TOO_LARGE');
});

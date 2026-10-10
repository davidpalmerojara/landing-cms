import { expect } from '@playwright/test';
import { test } from './support';

/**
 * PUBLIC3-001: at phone width the preview's top bar showed "Publicada en /p/..." drawn over the
 * "Publicada" chip, with the new address cut to "/...". The confirmation now has a row of its own.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('PUBLIC3-001: after publishing from the preview at 390 px, the address is readable and overlaps nothing', async ({ page, baseURL }) => {
  const name = `bar${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const registered = await page.request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL ?? '' },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const created = await page.request.post('/api/pages/', {
    data: {
      name: 'Barra de vista previa',
      language: 'es',
      blocks: [{ id: crypto.randomUUID(), type: 'cta', order: 0, data: { title: 'Hola', subtitle: '', buttonText: 'Ir', buttonLink: '#' }, styles: {} }],
    },
    headers: { Origin: baseURL ?? '' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id, slug } = (await created.json()) as { id: string; slug: string };

  await page.goto(`/preview/${id}`);
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();

  const bar = page.locator('div.sticky').first();
  const status = bar.getByRole('status');
  const address = status.getByRole('link', { name: new RegExp(`/p/${slug}`) });
  await expect(address).toBeVisible();

  // The whole address is on screen and tappable, not cut to "/..."
  await expect(address).toContainText(`/p/${slug}`);
  const addressBox = await address.boundingBox();
  expect(addressBox, 'the address has a box').not.toBeNull();
  expect(addressBox?.x).toBeGreaterThanOrEqual(0);
  expect((addressBox?.x ?? 0) + (addressBox?.width ?? 0)).toBeLessThanOrEqual(390);

  // ...and nothing else in the bar is drawn over it
  const chip = bar.getByText('Publicada', { exact: true });
  const chipBox = await chip.boundingBox();
  expect(chipBox, 'the status chip has a box').not.toBeNull();
  const overlaps = (a: NonNullable<typeof addressBox>, b: NonNullable<typeof chipBox>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(addressBox as NonNullable<typeof addressBox>, chipBox as NonNullable<typeof chipBox>)).toBe(false);
  const button = bar.getByRole('button');
  const buttonBox = await button.boundingBox();
  expect(overlaps(addressBox as NonNullable<typeof addressBox>, buttonBox as NonNullable<typeof buttonBox>)).toBe(false);
});

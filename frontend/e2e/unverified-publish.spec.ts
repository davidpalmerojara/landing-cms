import { expect } from '@playwright/test';
import { test, verifyEmail } from './support';

/**
 * C5 / SEC-004 (ADR-052): an account registered in one request with any email
 * published an indexable page with Custom HTML and a working contact form on
 * the app's own origin. Until the email is verified the page is published like
 * a guest's: a notice, no Custom HTML, a form that does not send, noindex and
 * out of the sitemap. Verifying (a magic link read from the email) lifts it,
 * and the cached public page is refreshed at once.
 */
test('an unverified account publishes like a guest until a magic link verifies its email', async ({ page, request, baseURL }) => {
  const origin = baseURL ?? '';
  const headers = { Origin: origin };
  const name = `unv${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${name}@example.com`;
  const registered = await request.post('/api/auth/register/', {
    data: { username: name, email, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers,
  });
  expect(registered.ok(), await registered.text()).toBe(true);

  const created = await request.post('/api/pages/', {
    data: {
      name: 'Sin verificar',
      blocks: [
        { id: crypto.randomUUID(), type: 'hero', order: 0, data: { title: 'Página sin verificar' }, styles: {} },
        { id: crypto.randomUUID(), type: 'customHtml', order: 1, data: { html: '<h3>Bloque propio</h3>' }, styles: {} },
        { id: crypto.randomUUID(), type: 'contact', order: 2, data: { title: 'Escríbenos', buttonText: 'Enviar' }, styles: {} },
      ],
    },
    headers,
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id, slug } = (await created.json()) as { id: string; slug: string };
  expect((await request.post(`/api/pages/${id}/publish/`, { headers })).ok()).toBe(true);

  // Before: the notice, no Custom HTML frame, a form that says it does not send, noindex, not in the sitemap
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página sin verificar');
  await expect(page.getByRole('complementary', { name: 'Aviso de Paxl' }).getByRole('note')).toContainText('no ha verificado su email');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByText('no envía mensajes hasta que quien publicó la página verifique su email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/p/${slug}<`);
  const contact = await request.post(`/api/public/pages/${slug}/contact/`, {
    data: { name: 'Ana', email: 'ana@example.com', message: 'Hola' },
    headers,
  });
  expect(contact.status()).toBe(403);
  expect((await contact.json()).code).toBe('UNVERIFIED_PAGE');

  await verifyEmail(request, origin, email);

  // After: the same published copy, now with everything (the backend refreshed the cached page)
  await page.goto(`/p/${slug}`);
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.frameLocator('iframe[sandbox]').getByRole('heading', { name: 'Bloque propio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  expect(await (await request.get('/sitemap.xml')).text()).toContain(`/p/${slug}<`);
});

import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * SEC2-002 / PUBLIC2-008: what the server accepts must be what the pages' CSP lets the browser load.
 * A <video> in a Custom HTML block fell back to default-src 'self' (no media-src) and never played,
 * and an http:// image was saved but blocked by img-src everywhere.
 */

async function signUp(request: APIRequestContext, baseURL: string): Promise<void> {
  const name = `media${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

function heroWith(backgroundImage: string) {
  return { id: crypto.randomUUID(), type: 'hero', order: 0, data: { title: 'Vídeo', backgroundImage }, styles: {} };
}

const VIDEO_HTML = '<video src="https://media.example.com/clip.mp4" controls muted></video>';

test('a Custom HTML video may load from https, and http:// images are refused when saving (SEC2-002)', async ({ page, request, baseURL }) => {
  await signUp(request, baseURL ?? '');
  const headers = { Origin: baseURL ?? '' };

  const insecure = await request.post('/api/pages/', {
    data: { name: 'Imagen http', blocks: [heroWith('http://images.example.com/a.png')] },
    headers,
  });
  expect(insecure.status()).toBe(400);
  expect(await insecure.text()).toContain('backgroundImage');

  const created = await request.post('/api/pages/', {
    data: {
      name: 'Vídeo',
      blocks: [
        heroWith('https://images.example.com/a.png'),
        { id: crypto.randomUUID(), type: 'customHtml', order: 1, data: { html: VIDEO_HTML }, styles: {} },
      ],
    },
    headers,
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id, slug } = (await created.json()) as { id: string; slug: string };
  const published = await request.post(`/api/pages/${id}/publish/`, { headers });
  expect(published.ok(), await published.text()).toBe(true);

  const response = await request.get(`/p/${slug}`);
  expect(response.headers()['content-security-policy']).toContain("media-src 'self' https:");

  // The block renders in a sandboxed frame that inherits the page's policy: a blocked load shows up in the console
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/content security policy|refused to load/i.test(message.text())) blocked.push(message.text());
  });
  await page.goto(`/p/${slug}`);
  await expect(page.frameLocator('iframe').first().locator('video')).toBeAttached();
  await page.waitForLoadState('networkidle');
  expect(blocked.filter((text) => text.includes('media.example.com'))).toEqual([]);
});

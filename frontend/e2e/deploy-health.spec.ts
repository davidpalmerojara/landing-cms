import { expect, test } from '@playwright/test';

/**
 * DEPLOY-006: the platform's health check and port detector may ask with a Host the app
 * does not list (localhost:10000, an internal address). /healthz must answer anyway.
 * The warm-up request of the landing page goes through the frontend's /api rewrite
 * (`/api/healthz`, no trailing slash), which has to reach the same answer without the database.
 */

const backendPort = process.env.E2E_BACKEND_PORT ?? '8101';
const UNLISTED_HOST = 'internal.render.invalid:10000';

test('the warm-up request reaches the backend through the /api rewrite', async ({ request }) => {
  const response = await request.get('/api/healthz');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('the backend answers /healthz for a Host that is not in ALLOWED_HOSTS (DEPLOY-006)', async ({ request }) => {
  const response = await request.get(`http://127.0.0.1:${backendPort}/healthz`, { headers: { Host: UNLISTED_HOST } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('other paths still refuse an unknown Host', async ({ request }) => {
  const response = await request.get(`http://127.0.0.1:${backendPort}/api/features/`, { headers: { Host: UNLISTED_HOST } });

  expect(response.status()).toBe(400);
});

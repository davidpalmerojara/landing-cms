import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { SAAS_TEMPLATE_BLOCK_COUNT, expectEditorReady, fetchServerPage, pageIdFromUrl, publishFromEditor, test } from './support';

const PASSWORD = 'E2e-Passw0rd-9x!';

/** Starts a guest, publishes the template page it opens with, and returns the public slug. */
async function publishAGuestPage(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar sin registrarse' }).first().click();
  await expectEditorReady(page, SAAS_TEMPLATE_BLOCK_COUNT);
  const pageId = pageIdFromUrl(page.url());
  await publishFromEditor(page);
  return (await fetchServerPage(page, pageId)).slug;
}

/** Records every Content-Security-Policy violation the page runs into. */
async function watchPolicyViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

async function newVisitor(browser: Browser, baseURL: string | undefined) {
  // No language cookie and no session: a stranger arriving at a link
  const context = await browser.newContext({ baseURL, locale: 'es-ES' });
  return { context, page: await context.newPage() };
}

test.describe('Visitors of a published page (D5, QA-025)', () => {
  test('get no cookie, nothing in storage and no request to another site', async ({ page, browser, baseURL }) => {
    const slug = await publishAGuestPage(page);

    const visitor = await newVisitor(browser, baseURL);
    const foreignRequests: string[] = [];
    visitor.page.on('request', (request) => {
      // The author's own pictures come from wherever they pasted them; scripts, fonts, styles and fetches may not
      if (request.resourceType() === 'image') return;
      if (!request.url().startsWith(baseURL ?? '') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
        foreignRequests.push(request.url());
      }
    });

    await visitor.page.goto(`/p/${slug}`);
    await expect(visitor.page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await visitor.page.waitForLoadState('networkidle');

    expect(await visitor.context.cookies()).toEqual([]);
    expect(await visitor.page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    expect(foreignRequests.filter((url) => !url.includes('127.0.0.1') && !url.includes('localhost'))).toEqual([]);
    await visitor.context.close();
  });

  test('the language cookie appears only when someone switches language', async ({ browser, baseURL }) => {
    const visitor = await newVisitor(browser, baseURL);

    await visitor.page.goto('/pricing');
    await expect(visitor.page).toHaveTitle('Precios — Paxl');
    expect((await visitor.context.cookies()).map((cookie) => cookie.name)).not.toContain('paxl-locale');

    await visitor.page.getByRole('button', { name: 'en', exact: true }).click();

    await expect(visitor.page).toHaveTitle('Pricing — Paxl');
    await expect(visitor.page.locator('html')).toHaveAttribute('lang', 'en');
    expect((await visitor.context.cookies()).map((cookie) => cookie.name)).toContain('paxl-locale');
    await visitor.context.close();
  });
});

test.describe('Security headers (QA-102)', () => {
  test('published pages get the strict policy, the app gets its own, and the framework is not announced', async ({ page, request }) => {
    const slug = await publishAGuestPage(page);

    const published = await request.get(`/p/${slug}`);
    const publishedPolicy = published.headers()['content-security-policy'] ?? '';
    expect(publishedPolicy).toContain("default-src 'self'");
    expect(publishedPolicy).toContain("object-src 'none'");
    expect(publishedPolicy).toContain("frame-ancestors 'none'");
    expect(publishedPolicy).not.toContain('google');
    expect(published.headers()['x-powered-by']).toBeUndefined();
    expect(published.headers()['strict-transport-security']).toContain('max-age=');

    const login = await request.get('/login');
    expect(login.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(login.headers()['x-frame-options']).toBe('DENY');
  });

  test('the policy breaks nothing: landing, sign-in, dashboard, editor, preview and a published page run without a violation', async ({ page, baseURL }) => {
    const violations = await watchPolicyViolations(page);
    const consoleProblems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
        consoleProblems.push(message.text());
      }
    });

    for (const path of ['/', '/login', '/register', '/pricing', '/privacy']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await violations(), `violations on ${path}`).toEqual([]);
    }

    const slug = await publishAGuestPage(page);
    const pageId = pageIdFromUrl(page.url());
    // The editor opened its collaboration socket and loaded fonts and previews under the policy
    await page.waitForLoadState('networkidle');
    expect(await violations(), 'violations in the editor').toEqual([]);

    for (const path of ['/dashboard', `/preview/${pageId}`, `/p/${slug}`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await violations(), `violations on ${path}`).toEqual([]);
    }
    expect(consoleProblems).toEqual([]);
    expect(baseURL).toBeTruthy();
  });
});

test.describe('Accounts ignore case (D8, QA-017)', () => {
  test('registering again with the same name or email in capitals is refused, and the lower-case login works', async ({ page }) => {
    const stamp = Date.now();
    const username = `CaseUser${stamp}`;
    const email = `CaseUser${stamp}@Example.com`;

    await page.goto('/register');
    await page.getByLabel('Usuario', { exact: true }).fill(username);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Same person, other casing: refused, and the message says what is taken
    await page.goto('/register');
    await page.getByLabel('Usuario', { exact: true }).fill(username.toUpperCase());
    await page.getByLabel('Email', { exact: true }).fill(email.toLowerCase());
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Ese nombre de usuario ya está en uso.')).toBeVisible();
    await expect(page.getByText('Ya existe una cuenta con este email.')).toBeVisible();

    // Signing in does not care about the capitals either
    await page.goto('/login');
    await page.getByLabel('Usuario', { exact: true }).fill(username.toLowerCase());
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('Payments are off without a Stripe test key (D2, QA-018)', () => {
  test('the billing page explains it, the API answers 503, and nothing offers an upgrade', async ({ page }) => {
    const features = await page.request.get('/api/features/');
    expect((await features.json()).billing).toBe(false);

    const username = `bill${Date.now()}`;
    await page.goto('/register');
    await page.getByLabel('Usuario', { exact: true }).fill(username);
    await page.getByLabel('Email', { exact: true }).fill(`${username}@example.com`);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Mejorar plan' })).toHaveCount(0);

    await page.goto('/settings');
    await page.getByRole('button', { name: /Facturación/ }).click();
    await expect(page).toHaveURL(/\/settings\/billing$/);
    await expect(page.getByRole('note')).toContainText('Los pagos no están activos en esta demo');
    await expect(page.getByRole('button', { name: 'Actualizar a Pro' })).toHaveCount(0);
    await expect(page.getByText('API 500')).toHaveCount(0);

    const checkout = await page.request.post('/api/billing/checkout/', { data: { cycle: 'monthly' } });
    expect(checkout.status()).toBe(503);
    expect((await checkout.json()).code).toBe('FEATURE_DISABLED');
  });
});

base.describe('A phone (QA-015, QA-058)', () => {
  base.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  base('the landing and the marketing pages have a login link, a menu, and no sideways scroll', async ({ page }) => {
    for (const path of ['/', '/pricing', '/about']) {
      await page.goto(path);
      const login = page.getByRole('link', { name: 'Iniciar sesión' }).first();
      await expect(login, `login link on ${path}`).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }

    await page.goto('/pricing');
    const menu = page.getByRole('button', { name: 'Menú' });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: /Cambiar a modo/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('link', { name: 'Iniciar sesión' }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', level: 1 })).toBeVisible();
  });
});

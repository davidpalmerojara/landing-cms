import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { getBlockDefaults } from '@/lib/block-defaults';
import { presetTokens, tokenPresets, tokensToApi } from '@/lib/design-tokens';
import type { BlockType } from '@/types/block-data';
import { test } from './support';

/**
 * Published pages, QA round 1 batch 3: WCAG AA contrast on every palette
 * (D3, QA-019, QA-024), the custom HTML frame (QA-010), `<html lang>` (QA-091)
 * and the page's structure for assistive tech.
 */

// The suite runs from frontend/ (npm run e2e)
const AXE_SOURCE = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

const BLOCK_ORDER: BlockType[] = [
  'navbar', 'hero', 'logoCloud', 'features', 'stats', 'pricing', 'testimonials', 'timeline',
  'team', 'gallery', 'faq', 'cta', 'customHtml', 'contact', 'footer',
];

interface PageResponse {
  id: string;
  slug: string;
  version: number;
}

interface AxeViolation {
  id: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

function allBlocks() {
  return BLOCK_ORDER.map((type, order) => ({
    id: crypto.randomUUID(),
    type,
    order,
    data: type === 'customHtml'
      ? { html: '<h3>Horario</h3><p>De lunes a viernes, de 9 a 18 h.</p><p>Escríbenos cuando quieras.</p>' }
      : getBlockDefaults(type, 'es'),
    styles: {},
  }));
}

async function signUp(request: APIRequestContext, baseURL: string): Promise<void> {
  const name = `pub${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await request.post('/api/auth/register/', {
    data: { username: name, email: `${name}@example.com`, password: 'Sup3r-secret-pw!', password2: 'Sup3r-secret-pw!' },
    headers: { Origin: baseURL },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

class PublishedPage {
  private blocks = allBlocks();

  private constructor(private request: APIRequestContext, private baseURL: string, private page: PageResponse) {}

  static async create(request: APIRequestContext, baseURL: string): Promise<PublishedPage> {
    await signUp(request, baseURL);
    const blocks = allBlocks();
    const response = await request.post('/api/pages/', {
      data: { name: 'Página de prueba', language: 'es', design_tokens: tokensToApi(presetTokens('default')), blocks },
      headers: { Origin: baseURL },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const created = new PublishedPage(request, baseURL, await response.json());
    created.blocks = blocks;
    return created;
  }

  get slug(): string {
    return this.page.slug;
  }

  /** Saves the draft with these page fields and publishes it. */
  async publishWith(fields: Record<string, unknown>): Promise<void> {
    const saved = await this.request.put(`/api/pages/${this.page.id}/`, {
      data: { name: 'Página de prueba', blocks: this.blocks, version: this.page.version, ...fields },
      headers: { Origin: this.baseURL },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    this.page = await saved.json();
    const published = await this.request.post(`/api/pages/${this.page.id}/publish/`, { headers: { Origin: this.baseURL } });
    expect(published.ok(), await published.text()).toBe(true);
    this.page = { ...this.page, ...(await published.json()) };
  }
}

async function axeViolations(page: Page, rules: string[]): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_SOURCE });
  return page.evaluate(async (runOnly) => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: 'rule', values: runOnly } });
    return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  }, rules);
}

function describeViolations(violations: AxeViolation[]): string {
  return violations
    .map(({ id, nodes }) => `${id}: ${nodes.map((node) => `${node.target.join(' ')} (${node.failureSummary?.split('\n').slice(-1)[0] ?? ''})`).join('; ')}`)
    .join('\n');
}

test.describe('Published page', () => {
  test.describe.configure({ mode: 'serial' });

  test('every palette passes WCAG AA contrast, on a phone and on a desktop (D3, QA-019, QA-024)', async ({ page, request, baseURL }) => {
    test.setTimeout(180_000);
    const published = await PublishedPage.create(request, baseURL ?? '');

    for (const preset of tokenPresets) {
      await published.publishWith({ design_tokens: tokensToApi(presetTokens(preset.id)) });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/p/${published.slug}`);
        const violations = await axeViolations(page, ['color-contrast']);
        expect(violations, `${preset.id} at ${width} px:\n${describeViolations(violations)}`).toEqual([]);
      }
    }
  });

  test('is one main landmark in the page\'s own language, with named buttons and no empty headings (QA-040, QA-090, QA-091)', async ({ page, request, baseURL }) => {
    const published = await PublishedPage.create(request, baseURL ?? '');
    await published.publishWith({ language: 'en' });

    // A Spanish-speaking visitor still gets the page's language
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
    await page.goto(`/p/${published.slug}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const html = await (await request.get(`/p/${published.slug}`, { headers: { 'Accept-Language': 'es' } })).text();
    expect(html).toMatch(/<html[^>]*lang="en"/);

    await expect(page.locator('#main-content')).toHaveCount(1);
    // The closing footer is the page's contentinfo landmark, outside <main> (PUBLIC2-005)
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    const violations = await axeViolations(page, ['landmark-one-main', 'button-name', 'link-name', 'empty-heading', 'html-has-lang', 'valid-lang', 'region', 'aria-prohibited-attr', 'landmark-contentinfo-is-top-level']);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('the custom HTML block shows up, every time, under the published page\'s strict policy (QA-010)', async ({ page, request, baseURL }) => {
    const published = await PublishedPage.create(request, baseURL ?? '');
    await published.publishWith({});
    const policyErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) policyErrors.push(message.text());
    });

    for (let load = 0; load < 5; load += 1) {
      await page.goto(`/p/${published.slug}`);
      const frame = page.locator('iframe[sandbox]');
      await expect(frame).toBeVisible();
      // The content (three short lines) is taller than nothing and not cut to the initial guess
      await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(60);
      await expect(page.frameLocator('iframe[sandbox]').getByRole('heading', { name: 'Horario' })).toBeVisible();
    }
    expect(policyErrors).toEqual([]);
  });

  test('the phone menu closes with Escape and when a link is followed (QA-048)', async ({ page, request, baseURL }) => {
    const published = await PublishedPage.create(request, baseURL ?? '');
    await published.publishWith({});
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/p/${published.slug}`);

    const toggle = page.getByRole('button', { name: 'Abrir menú' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('navigation').getByRole('link', { name: 'Precios' }).focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.getByRole('navigation').getByRole('link', { name: 'Precios' }).click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

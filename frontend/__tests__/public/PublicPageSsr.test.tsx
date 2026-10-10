// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import PublicPageClient from '@/app/p/[slug]/PublicPageClient';
import type { ApiPublicPage } from '@/lib/api';
import { blockRegistry } from '@/lib/block-registry';
import { getBlockDefaults } from '@/lib/block-defaults';
import { isBlockType } from '@/lib/block-data';
import { MESSAGES } from '@/lib/i18n';

const blockIds = Object.keys(blockRegistry).map((_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
const heroId = blockIds[Object.keys(blockRegistry).indexOf('hero')];

const page: ApiPublicPage = {
  id: 'page-1',
  slug: 'mi-landing',
  status: 'published',
  name: 'Mi landing',
  design_tokens: {},
  blocks: Object.entries(blockRegistry).map(([type], order) => ({
    id: blockIds[order],
    type,
    order,
    data: (type === 'hero'
      ? { ...getBlockDefaults('hero', 'es'), title: 'Lanza tu producto hoy', buttonLink: '#pricing' }
      : isBlockType(type) ? { ...getBlockDefaults(type, 'es') } : {}) as Record<string, unknown>,
    styles: type === 'hero'
      ? { paddingTop: 96, responsive: { mobile: { paddingTop: 32 } } }
      : {},
  })),
  published_at: '2026-10-09T10:00:00Z',
  updated_at: '2026-10-09T10:00:00Z',
  show_watermark: true,
};

function renderOnServer(p: ApiPublicPage): string {
  return renderToString(
    <NextIntlClientProvider locale="es" messages={MESSAGES.es}>
      <PublicPageClient page={p} />
    </NextIntlClientProvider>,
  );
}

describe('public page rendered on the server', () => {
  const html = renderOnServer(page);

  it('contains the content of every block, not an empty shell', () => {
    expect(html).toContain('Lanza tu producto hoy');
    expect(html).toContain('Preguntas frecuentes');
    expect(html).toContain('¿Cómo empiezo a usar el producto?');
    expect(html).toContain('Planes y precios');
    for (const id of blockIds) expect(html).toContain(`data-block-id="${id}"`);
  });

  it('has real links and a contact form that work without JavaScript', () => {
    expect(html).toContain('href="#pricing"');
    expect(html).toMatch(/<form[^>]*>/);
  });

  it('chooses the layout with CSS: a size container and per-device block styles', () => {
    expect(html).toMatch(/class="[^"]*@container/);
    expect(html).toContain(`.paxl-b-${heroId}{padding-top:96px}`);
    expect(html).toContain(`@container (max-width: 639.98px){.paxl-b-${heroId}{padding-top:32px}}`);
  });

  it('shows the watermark text', () => {
    expect(html).toContain(MESSAGES.es.publicPage.madeWith);
  });

  it('PUBLIC2-006: Paxl\'s own words are marked with the visitor\'s language, the page area with the page\'s', () => {
    const english = renderToString(
      <NextIntlClientProvider locale="en" messages={MESSAGES.en}>
        <PublicPageClient page={{ ...page, language: 'es', is_guest_page: true }} />
      </NextIntlClientProvider>,
    );

    expect(english).toMatch(new RegExp(`<aside lang="en"[^>]*>[^]*${MESSAGES.en.publicPage.madeWith}`));
    expect(english).toMatch(/<aside lang="en"[^>]*><p role="note"/);
    expect(english).toMatch(/<main[^>]*lang="es"/);
  });
});

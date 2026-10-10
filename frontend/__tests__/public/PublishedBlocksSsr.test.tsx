// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import PublicPageClient from '@/app/p/[slug]/PublicPageClient';
import PublicPageNotFound from '@/app/p/[slug]/not-found';
import BlockContent from '@/components/blocks/BlockContent';
import CustomHtmlBlock, { CUSTOM_HTML_INITIAL_HEIGHT } from '@/components/blocks/CustomHtmlBlock';
import type { ApiPublicPage } from '@/lib/api';
import { blockRegistry } from '@/lib/block-registry';
import { createBlock } from '@/lib/block-factory';
import { makeBlock } from '@/lib/block-data';
import { MESSAGES } from '@/lib/i18n';
import { defaultBlockStyles, type BlockType } from '@/types/blocks';

function ssr(ui: ReactElement, locale: 'es' | 'en' = 'es'): string {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>{ui}</NextIntlClientProvider>,
  );
}

const types = Object.keys(blockRegistry) as BlockType[];

function publicPage(overrides: Partial<ApiPublicPage> = {}): ApiPublicPage {
  return {
    id: 'page-1',
    slug: 'mi-landing',
    status: 'published',
    name: 'Mi landing',
    design_tokens: {},
    blocks: types.map((type, order) => {
      const block = createBlock(type, 'es');
      return { id: block.id, type, order, data: block.data as unknown as Record<string, unknown>, styles: {} };
    }),
    published_at: null,
    updated_at: null,
    show_watermark: false,
    ...overrides,
  };
}

describe('published page structure', () => {
  it('is the main landmark the skip link points to (QA-090)', () => {
    expect(ssr(<PublicPageClient page={publicPage()} />)).toMatch(/<main[^>]*id="main-content"/);
  });

  it('PUBLIC2-009: blocks with nothing written in them leave no band of padding', () => {
    const blocks = (['navbar', 'hero', 'features', 'footer'] as const).map((type, order) => {
      const block = createBlock(type, 'es');
      const emptied = type === 'hero'
        ? { ...(block.data as unknown as Record<string, unknown>) }
        : Object.fromEntries(Object.entries(block.data).map(([key, value]) => [key, Array.isArray(value) ? [] : typeof value === 'string' ? '' : value]));
      return { id: block.id, type, order, data: emptied, styles: {} };
    });
    const html = ssr(<PublicPageClient page={publicPage({ blocks })} />);

    expect(html).toContain('data-block-type="hero"');
    expect(html).not.toContain('data-block-type="navbar"');
    expect(html).not.toContain('data-block-type="features"');
    expect(html).not.toContain('data-block-type="footer"');
  });

  it('PUBLIC2-005: a footer that closes the page is after <main>, so it is the contentinfo landmark', () => {
    const order = ['navbar', 'hero', 'footer'] as const;
    const blocks = order.map((type, index) => {
      const block = createBlock(type, 'es');
      return { id: block.id, type, order: index, data: block.data as unknown as Record<string, unknown>, styles: {} };
    });
    const html = ssr(<PublicPageClient page={publicPage({ blocks })} />);

    const mainEnd = html.indexOf('</main>');
    expect(mainEnd).toBeGreaterThan(0);
    expect(html.indexOf('<footer')).toBeGreaterThan(mainEnd);
    expect(html.indexOf('<nav')).toBeLessThan(mainEnd);
  });

  it('PUBLIC3-002: with several footers only the last block is the contentinfo; the others stay inside <main>', () => {
    const order = ['hero', 'footer', 'cta', 'footer', 'footer'] as const;
    const blocks = order.map((type, index) => {
      const block = createBlock(type, 'es');
      return { id: block.id, type, order: index, data: block.data as unknown as Record<string, unknown>, styles: {} };
    });
    const html = ssr(<PublicPageClient page={publicPage({ blocks })} />);

    const mainEnd = html.indexOf('</main>');
    const footers = [...html.matchAll(/<footer/g)].map((match) => match.index ?? -1);
    expect(footers).toHaveLength(3);
    expect(footers.filter((at) => at > mainEnd)).toHaveLength(1);
  });

  it('PUBLIC3-002: a page of a single footer keeps it in <main>', () => {
    const block = createBlock('footer', 'es');
    const html = ssr(<PublicPageClient page={publicPage({
      blocks: [{ id: block.id, type: 'footer', order: 0, data: block.data as unknown as Record<string, unknown>, styles: {} }],
    })} />);

    expect(html.indexOf('<footer')).toBeLessThan(html.indexOf('</main>'));
  });

  it('PUBLIC3-003: the footer brand is not a heading, so it cannot skip a level after the hero', () => {
    const order = ['hero', 'footer'] as const;
    const blocks = order.map((type, index) => {
      const block = createBlock(type, 'es');
      return { id: block.id, type, order: index, data: block.data as unknown as Record<string, unknown>, styles: {} };
    });
    const html = ssr(<PublicPageClient page={publicPage({ blocks })} />);

    expect(html).toContain('<footer');
    expect(html).not.toMatch(/<h3[^>]*>/);
  });

  it('declares the language the page is written in, whatever the visitor\'s (QA-091)', () => {
    const html = ssr(<PublicPageClient page={publicPage({ language: 'en' })} />, 'es');
    expect(html).toMatch(/<div lang="en"[^>]*>[^]*<main/);
    // Paxl's words inside the blocks follow the page: the hero's landmark name is English
    expect(html).toContain(`aria-label="${MESSAGES.en.blocks.heroAria}"`);
  });

  it('leaves room for the watermark at the end of the page (QA-124)', () => {
    const html = ssr(<PublicPageClient page={publicPage({ show_watermark: true })} />);
    expect(html).toMatch(/<div[^>]*class="[^"]*pb-16/);
    expect(html).toContain(MESSAGES.es.publicPage.madeWith);
  });

  it('puts Paxl\'s notices outside the themed page, above it (QA-005)', () => {
    const html = ssr(<PublicPageClient page={publicPage({ is_guest_page: true, show_watermark: true })} />);
    const notice = html.indexOf(MESSAGES.es.publicPage.guestNotice);
    const main = html.indexOf('<main');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(main);
    expect(html).toMatch(/<div[^>]*class="[^"]*isolate/);
    expect(html.indexOf(MESSAGES.es.publicPage.madeWith)).toBeGreaterThan(html.indexOf('</main>'));
  });
});

describe('hero background image (QA-005)', () => {
  it('is quoted inside url(), so a hostile value cannot add declarations', () => {
    const hostile = 'https://x.test/a.png);position:fixed;inset:0;z-index:99999;background:red;--x:url(x';
    const hero = makeBlock({ id: 'h1', name: 'Hero', styles: defaultBlockStyles }, 'hero', { title: 'Hola', backgroundImage: hostile });
    const html = ssr(<BlockContent block={hero} isPreviewMode />);
    const style = html.match(/<section[^>]*style="([^"]*)"/)![1].replaceAll('&quot;', '"');
    // Declarations as CSS reads them: a ';' inside a quoted string does not end one
    const properties = style.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((declaration) => declaration.split(':')[0]);
    expect(properties).toEqual(['background-image', 'background-size', 'background-position']);
    expect(style).toContain(`url(${JSON.stringify(hostile)})`);
  });
});

describe('empty texts on the page (QA-040)', () => {
  it('render no empty heading and no nameless button', () => {
    const hero = makeBlock({ id: 'h1', name: 'Hero', styles: defaultBlockStyles }, 'hero', { title: '', subtitle: '', buttonText: '', buttonLink: '#x' });
    const cta = makeBlock({ id: 'c1', name: 'CTA', styles: defaultBlockStyles }, 'cta', { title: '', buttonText: ' ', buttonLink: '#x' });
    const html = ssr(<><BlockContent block={hero} isPreviewMode /><BlockContent block={cta} isPreviewMode /></>);
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*<\/h[1-6]>/);
    expect(html).not.toMatch(/<h1/);
    expect(html).not.toMatch(/<(a|button)\b/);
  });

  it('render a placeholder to type into on the editor canvas', () => {
    const hero = makeBlock({ id: 'h1', name: 'Hero', styles: defaultBlockStyles }, 'hero', { title: '' });
    const html = ssr(<BlockContent block={hero} isPreviewMode={false} />);
    expect(html).toMatch(new RegExp(`<h1[^>]*data-placeholder="${MESSAGES.es.blocks.emptyText}"`));
  });
});

describe('without JavaScript (QA-050)', () => {
  it('the FAQ has every answer in the HTML, closed ones hidden', () => {
    const faq = createBlock('faq', 'es');
    if (faq.type !== 'faq') throw new Error('Expected a FAQ block');
    const html = ssr(<BlockContent block={faq} isPreviewMode />);
    for (const { answer } of faq.data.questions) expect(html).toContain(answer);
    expect(html.match(/<div[^>]*hidden=""/g)).toHaveLength(faq.data.questions.length);
  });

  it('the contact form posts (never a GET with the message in the URL) and cannot send before React runs', () => {
    const html = ssr(<BlockContent block={createBlock('contact', 'es')} isPreviewMode />);
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe('custom HTML on the page', () => {
  it('has a height before it can be measured, so it shows without JavaScript (QA-010)', () => {
    const html = ssr(<CustomHtmlBlock blockId="b" data={{ html: '<p>Hola</p>' }} isPreviewMode />);
    expect(html).toContain(`height:${CUSTOM_HTML_INITIAL_HEIGHT}px`);
  });

  it('is titled in words, not with a message key (QA-041)', () => {
    const html = ssr(<CustomHtmlBlock blockId="b" data={{ html: '<p>Hola</p>' }} isPreviewMode />);
    expect(html).toContain(`title="${MESSAGES.es.blocks.customHtmlPreview}"`);
  });

  it('renders nothing when empty, never the editor placeholder (QA-042)', () => {
    expect(ssr(<CustomHtmlBlock blockId="b" data={{ html: '' }} isPreviewMode />)).toBe('');
  });
});

describe('block backgrounds (QA-096)', () => {
  it.each(types.filter((type) => type !== 'customHtml'))('"%s" paints its section with the block override first', (type) => {
    const html = ssr(<BlockContent block={createBlock(type, 'es')} isPreviewMode />);
    expect(html).toContain('background-color:var(--block-bg,');
  });
});

describe('long unbroken words (QA-095)', () => {
  it.each(types)('"%s" lets them wrap instead of overflowing the screen', (type) => {
    const html = ssr(<BlockContent block={createBlock(type, 'es')} isPreviewMode />);
    if (html === '') return; // an empty custom HTML block renders nothing
    expect(html.startsWith('<div class="contents [overflow-wrap:anywhere]">')).toBe(true);
  });
});

describe('public 404 (QA-092)', () => {
  it('uses fixed light colors and offers no dashboard to anonymous visitors', () => {
    const html = ssr(<PublicPageNotFound />);
    expect(html).not.toContain('/dashboard');
    expect(html).not.toMatch(/text-(muted|secondary)\b/);
    expect(html).toMatch(/<main[^>]*id="main-content"/);
  });
});

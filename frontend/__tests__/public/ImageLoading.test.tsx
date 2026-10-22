// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import PageRenderer from '@/components/renderer/PageRenderer';
import { makeBlock } from '@/lib/block-data';
import { MESSAGES } from '@/lib/i18n';
import { defaultBlockStyles, type Block, type BlockType } from '@/types/blocks';

/**
 * PERF-002 / MOBILE-004: a published page loaded every gallery photo before
 * its hero (LCP 7.4 s on a phone). Images of the first blocks load at once;
 * the rest are lazy, decode off the main thread and reserve their space.
 */

let nextId = 0;
function block(type: BlockType, data: Record<string, unknown>): Block {
  nextId += 1;
  const id = `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`;
  return makeBlock({ id, name: type, styles: { ...defaultBlockStyles } }, type, data);
}

const gallery = () => block('gallery', {
  title: 'Galería',
  columns: '3',
  images: [{ src: '/media/assets/a.webp', alt: 'Uno' }, { src: '/media/assets/b.webp', alt: 'Dos' }],
});
const hero = (backgroundImage = '/media/assets/hero.webp') => block('hero', { title: 'Hola', backgroundImage });
const features = () => block('features', { title: 'Lo que hace', features: [{ title: 'A', description: 'B' }] });
const team = () => block('team', { title: 'Equipo', members: [{ name: 'Ana', role: 'CEO', image: '/media/assets/ana.webp' }] });

function render(blocks: Block[]): string {
  return renderToString(
    <NextIntlClientProvider locale="es" messages={MESSAGES.es}>
      <PageRenderer blocks={blocks} themeVars={{}} language="es" />
    </NextIntlClientProvider>,
  );
}

function imgTags(html: string, src: string): string[] {
  return [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes(`src="${src}"`));
}

describe('image loading on published pages (PERF-002)', () => {
  it('a gallery further down the page is lazy, decodes async and keeps its 4:3 space', () => {
    const html = render([hero(), features(), gallery()]);
    const [first] = imgTags(html, '/media/assets/a.webp');
    expect(first).toContain('loading="lazy"');
    expect(first).toContain('decoding="async"');
    expect(first).toContain('width="800"');
    expect(first).toContain('height="600"');
    expect(first).not.toMatch(/fetchpriority/i);
  });

  it('a gallery at the top of the page loads at once, with high priority', () => {
    const html = render([gallery(), features()]);
    const [first] = imgTags(html, '/media/assets/a.webp');
    expect(first).toContain('loading="eager"');
    expect(first).toMatch(/fetchpriority="high"/i);
  });

  it('team photos have their size and are lazy below the first blocks', () => {
    const html = render([hero(), features(), team()]);
    const [photo] = imgTags(html, '/media/assets/ana.webp');
    expect(photo).toContain('width="96"');
    expect(photo).toContain('loading="lazy"');
  });

  it('a hero background at the top is preloaded; further down it is not', () => {
    const top = render([hero('/media/assets/top.webp'), features()]);
    expect(top).toMatch(/<link[^>]*rel="preload"[^>]*href="\/media\/assets\/top\.webp"/);

    const low = render([features(), features(), hero('/media/assets/low.webp')]);
    expect(low).not.toMatch(/rel="preload"[^>]*low\.webp/);
  });
});

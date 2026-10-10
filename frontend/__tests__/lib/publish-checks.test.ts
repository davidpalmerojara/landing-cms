import { describe, expect, it } from 'vitest';
import { blockRegistry } from '@/lib/block-registry';
import { createBlock } from '@/lib/block-factory';
import { blockAnchorIds } from '@/lib/block-anchors';
import { makeBlock } from '@/lib/block-data';
import { linklessItems, publishNotice } from '@/lib/publish-checks';
import { getPageTemplates, instantiateTemplate } from '@/lib/templates';
import { defaultBlockStyles, type Block, type BlockType } from '@/types/blocks';
import { MESSAGES } from '@/lib/i18n';
import { createTranslator } from 'next-intl';
import type { Translate } from '@/lib/api-errors';

const types = Object.keys(blockRegistry) as BlockType[];

function anchorsOf(blocks: Block[]): Set<string> {
  return new Set([...blockAnchorIds(blocks).values()].map((id) => `#${id}`));
}

describe('linklessItems (D9, QA-049)', () => {
  it('lists buttons and menu items with text and no usable link', () => {
    const hero = makeBlock({ id: 'h', name: 'Hero', styles: defaultBlockStyles }, 'hero', {
      buttonText: 'Empezar', buttonLink: '', secondaryButtonText: 'Más', secondaryButtonLink: 'javascript:alert(1)',
    });
    const navbar = makeBlock({ id: 'n', name: 'Navbar', styles: defaultBlockStyles }, 'navbar', {
      links: [{ label: 'Precios', url: '#pricing' }, { label: 'Blog', url: '' }, { label: '', url: '' }],
      ctaText: '', ctaLink: '',
    });

    expect(linklessItems([hero, navbar]).map((item) => item.label)).toEqual(['Empezar', 'Más', 'Blog']);
  });

  it.each(['es', 'en'])('new blocks in "%s" come with links to sections of the page', (locale) => {
    const blocks = types.map((type) => createBlock(type, locale));
    expect(linklessItems(blocks)).toEqual([]);
  });

  it.each(['es', 'en'])('every template in "%s" publishes without dead buttons, and its anchors exist', (locale) => {
    for (const template of getPageTemplates(locale)) {
      const { blocks } = instantiateTemplate(template);
      expect(linklessItems(blocks), template.id).toEqual([]);
      const anchors = anchorsOf(blocks);
      const links = blocks.flatMap((block) => JSON.stringify(block.data).match(/"#[a-zA-Z]+"/g) ?? []).map((l) => l.slice(1, -1));
      for (const link of links) expect(anchors, `${template.id}: ${link}`).toContain(link);
    }
  });
});

describe('publishNotice', () => {
  const translate = createTranslator({ locale: 'es', messages: MESSAGES.es });
  // The ICU formatter of the app (plurals included), with plain string keys
  const t: Translate = (key, values) => translate(key as Parameters<typeof translate>[0], values as Parameters<typeof translate>[1]);

  it('warns about an empty page', () => {
    expect(publishNotice([], t)).toBe(MESSAGES.es.publishing.emptyPage);
  });

  it('names the buttons that will show as text', () => {
    const cta = makeBlock({ id: 'c', name: 'CTA', styles: defaultBlockStyles }, 'cta', { buttonText: 'Suscribirse', buttonLink: '' });
    expect(publishNotice([cta], t)).toContain('“Suscribirse”');
  });

  it('says nothing when every button has a link', () => {
    expect(publishNotice([createBlock('cta', 'es')], t)).toBeNull();
  });
});

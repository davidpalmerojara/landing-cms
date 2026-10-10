import { describe, expect, it } from 'vitest';
import { normalizeBlockData, isBlockType } from '@/lib/block-data';
import { getBlockDefaults, getNewListItem } from '@/lib/block-defaults';
import { blockRegistry } from '@/lib/block-registry';
import { createBlock } from '@/lib/block-factory';
import { CONTENT_LOCALES, toContentLocale } from '@/lib/content-locale';
import { getDefaultPage } from '@/lib/default-page';
import type { BlockType } from '@/types/blocks';
import { SPANISH_MARKERS, shapeOf, stringsIn } from './content-helpers';

const allTypes = Object.keys(blockRegistry).filter(isBlockType);

describe('toContentLocale', () => {
  it('follows the interface language and falls back to Spanish', () => {
    expect(toContentLocale('en')).toBe('en');
    expect(toContentLocale('en-US')).toBe('en');
    expect(toContentLocale('es')).toBe('es');
    expect(toContentLocale('fr')).toBe('es');
    expect(toContentLocale(undefined)).toBe('es');
  });
});

describe('block defaults', () => {
  it('the Spanish check does recognise Spanish', () => {
    expect(SPANISH_MARKERS.test('Descubre las ventajas')).toBe(true);
    expect(SPANISH_MARKERS.test('Hasta 5 páginas')).toBe(true);
    expect(SPANISH_MARKERS.test('Discover the benefits')).toBe(false);
    for (const type of allTypes) {
      if (type === 'customHtml') continue;
      expect(stringsIn(getBlockDefaults(type, 'es')).some((text) => SPANISH_MARKERS.test(text)), type).toBe(true);
    }
  });

  it('every block type has sample content in Spanish and English with the same shape', () => {
    for (const type of allTypes) {
      const es = getBlockDefaults(type, 'es');
      const en = getBlockDefaults(type, 'en');
      expect(shapeOf(en), type).toEqual(shapeOf(es));
    }
  });

  it('is valid data for its block type in both languages', () => {
    for (const locale of CONTENT_LOCALES) {
      for (const type of allTypes) {
        const defaults = getBlockDefaults(type, locale);
        expect(normalizeBlockData(type, defaults), `${locale}/${type}`).toEqual(defaults);
      }
    }
  });

  it('keeps the Spanish text new blocks always had', () => {
    expect(getBlockDefaults('hero', 'es')).toMatchObject({
      title: 'Tu Nueva Sección',
      subtitle: 'Añade una descripción cautivadora aquí.',
      buttonText: 'Acción Principal',
      badgeText: 'Nuevo Editor UI',
    });
    expect(getBlockDefaults('features', 'es').features[0].title).toBe('Característica 1');
    expect(getBlockDefaults('faq', 'es').questions[0].question).toBe('¿Cómo empiezo a usar el producto?');
    expect(getBlockDefaults('pricing', 'es')).toMatchObject({ billingPeriod: '/mes' });
  });

  it('English sample content has no Spanish in it', () => {
    for (const type of allTypes) {
      for (const text of stringsIn(getBlockDefaults(type, 'en'))) {
        expect(text, `en/${type}`).not.toMatch(SPANISH_MARKERS);
      }
    }
  });

  it('the English text is really different from the Spanish one', () => {
    for (const type of allTypes) {
      if (type === 'customHtml') continue; // empty in both
      const es = stringsIn(getBlockDefaults(type, 'es')).filter(Boolean);
      const en = stringsIn(getBlockDefaults(type, 'en')).filter(Boolean);
      expect(en, type).not.toEqual(es);
    }
    expect(getBlockDefaults('hero', 'en').title).toBe('Your New Section');
  });

  it('picks the language by locale, with Spanish as the fallback', () => {
    expect(getBlockDefaults('cta', 'en-GB').title).toBe('Start your journey');
    expect(getBlockDefaults('cta', 'fr').title).toBe('Comienza tu viaje');
  });

  it('hands out a copy each time, so editing one block never changes the next', () => {
    const first = getBlockDefaults('features', 'es');
    first.features.push({ title: 'x', description: 'y' });
    first.title = 'changed';
    const second = getBlockDefaults('features', 'es');
    expect(second.title).toBe('Descubre las ventajas');
    expect(second.features).toHaveLength(2);
  });

  it('a block created in English starts with English content', () => {
    const block = createBlock('hero', 'en');
    expect(block.type).toBe('hero');
    expect(block.type === 'hero' && block.data.title).toBe('Your New Section');
  });
});

describe('items added to a list', () => {
  it('every list field has a new item in both languages, valid for the schema', () => {
    for (const locale of CONTENT_LOCALES) {
      for (const type of allTypes) {
        for (const field of blockRegistry[type].fields) {
          if (field.type !== 'list') continue;
          const item = getNewListItem(type as BlockType, field.key, locale);
          expect(item, `${locale}/${type}.${field.key}`).not.toBeNull();
          // Same keys as the items of the block's own sample list
          const sample = (getBlockDefaults(type, locale) as unknown as Record<string, object[]>)[field.key][0];
          expect(Object.keys(item ?? {}).sort(), `${locale}/${type}.${field.key}`).toEqual(Object.keys(sample).sort());
        }
      }
    }
  });

  it('English items have no Spanish in them', () => {
    for (const type of allTypes) {
      for (const field of blockRegistry[type].fields) {
        if (field.type !== 'list') continue;
        for (const text of stringsIn(getNewListItem(type, field.key, 'en'))) {
          expect(text, `en/${type}.${field.key}`).not.toMatch(SPANISH_MARKERS);
        }
      }
    }
  });

  it('is null for a field that is not a list', () => {
    expect(getNewListItem('hero', 'title', 'en')).toBeNull();
    expect(getNewListItem('faq', 'constructor', 'en')).toBeNull();
  });
});

describe('default page of the editor', () => {
  it('has the same blocks in both languages, written in each', () => {
    const es = getDefaultPage('es');
    const en = getDefaultPage('en');
    expect(en.blocks.map((b) => b.type)).toEqual(es.blocks.map((b) => b.type));
    expect(es.blocks[0].type === 'hero' && es.blocks[0].data.title).toBe('Crea landing pages increíbles.');
    expect(en.blocks[0].type === 'hero' && en.blocks[0].data.title).toBe('Create amazing landing pages.');
    expect(en.blocks[0].type === 'hero' && en.blocks[0].data.badgeText).toBe('');
    for (const block of en.blocks) {
      for (const text of stringsIn(block.data)) expect(text, block.type).not.toMatch(SPANISH_MARKERS);
    }
  });
});

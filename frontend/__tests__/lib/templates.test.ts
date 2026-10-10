import { describe, expect, it } from 'vitest';
import { normalizeBlockData } from '@/lib/block-data';
import { CONTENT_LOCALES } from '@/lib/content-locale';
import { GUEST_TEMPLATE_ID } from '@/lib/guest';
import { buildPagePayload, getPageTemplates, instantiateTemplate } from '@/lib/templates';
import { SPANISH_MARKERS, stringsIn } from './content-helpers';

describe('page templates', () => {
  it('has the same four templates, in the same order, in both languages', () => {
    const ids = (locale: string) => getPageTemplates(locale).map((template) => template.id);
    expect(ids('es')).toEqual(['saas-landing', 'portfolio', 'restaurant', 'coming-soon']);
    expect(ids('en')).toEqual(ids('es'));
  });

  it('has the same block types in the same order in both languages', () => {
    const en = getPageTemplates('en');
    getPageTemplates('es').forEach((template, index) => {
      expect(en[index].blocks.map((block) => block.type), template.id).toEqual(template.blocks.map((block) => block.type));
      expect(en[index].presetId).toBe(template.presetId);
    });
  });

  it('keeps the same data keys in both languages, so no field is lost in translation', () => {
    const en = getPageTemplates('en');
    getPageTemplates('es').forEach((template, index) => {
      template.blocks.forEach((block, blockIndex) => {
        expect(Object.keys(en[index].blocks[blockIndex].data).sort(), `${template.id}/${block.type}`)
          .toEqual(Object.keys(block.data).sort());
      });
    });
  });

  it.each(CONTENT_LOCALES)('every %s block survives normalizeBlockData unchanged', (locale) => {
    for (const template of getPageTemplates(locale)) {
      for (const block of template.blocks) {
        expect(normalizeBlockData(block.type, block.data), `${template.id}/${block.type}`).toMatchObject(block.data);
      }
    }
  });

  it('shows names, descriptions and categories in the language asked for', () => {
    const [spanishRestaurant, englishRestaurant] = ['es', 'en'].map(
      (locale) => getPageTemplates(locale).find((template) => template.id === 'restaurant'),
    );
    expect(spanishRestaurant).toMatchObject({ name: 'Restaurante', category: 'Gastronomía' });
    expect(englishRestaurant).toMatchObject({ name: 'Restaurant', category: 'Food & drink' });
    for (const template of getPageTemplates('en')) {
      for (const text of [template.name, template.description, template.category]) {
        expect(text, template.id).not.toMatch(SPANISH_MARKERS);
      }
    }
  });

  it('English templates have no Spanish text in their blocks', () => {
    for (const template of getPageTemplates('en')) {
      for (const block of template.blocks) {
        for (const text of stringsIn(block.data)) {
          expect(text, `${template.id}/${block.type}`).not.toMatch(SPANISH_MARKERS);
        }
      }
    }
  });

  it('keeps images and links identical across languages', () => {
    const urls = (blocks: { data: object }[]) => stringsIn(blocks.map((block) => block.data)).filter((text) => /^(https?:|#)/.test(text));
    const en = getPageTemplates('en');
    getPageTemplates('es').forEach((template, index) => {
      expect(urls(en[index].blocks), template.id).toEqual(urls(template.blocks));
    });
  });

  it('falls back to Spanish for an unknown language', () => {
    expect(getPageTemplates('fr')[0].description).toBe(getPageTemplates('es')[0].description);
  });
});

describe('buildPagePayload', () => {
  it('creates the page in the language of the interface', () => {
    const spanish = buildPagePayload('restaurant', 'Sin título', 'es');
    const english = buildPagePayload('restaurant', 'Untitled', 'en');

    expect(spanish.name).toBe('Restaurante');
    expect(english.name).toBe('Restaurant');
    const hero = (payload: Record<string, unknown>) =>
      (payload.blocks as { type: string; data: Record<string, unknown> }[]).find((block) => block.type === 'hero');
    expect(hero(spanish)?.data.title).toBe('Sabor auténtico en cada bocado.');
    expect(hero(english)?.data.title).toBe('Authentic flavor in every bite.');
  });

  it('starts the guest flow with the SaaS template in either language', () => {
    for (const locale of CONTENT_LOCALES) {
      const payload = buildPagePayload(GUEST_TEMPLATE_ID, 'Untitled', locale);
      expect((payload.blocks as unknown[]).length).toBeGreaterThan(5);
    }
    const english = buildPagePayload(GUEST_TEMPLATE_ID, 'Untitled', 'en');
    const texts = stringsIn(english.blocks);
    expect(texts).toContain('Sync your data in real time');
    expect(texts.filter((text) => SPANISH_MARKERS.test(text))).toEqual([]);
  });

  it('gives each block its own id and a position', () => {
    const payload = buildPagePayload('portfolio', 'Untitled', 'en');
    const blocks = payload.blocks as { id: string; order: number }[];
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length);
    expect(blocks.map((block) => block.order)).toEqual(blocks.map((_, index) => index));
  });

  it('makes a blank page, named in the language of the interface, without a template', () => {
    expect(buildPagePayload(null, 'Untitled', 'en')).toMatchObject({ name: 'Untitled', blocks: [] });
    expect(buildPagePayload('does-not-exist', 'Sin título', 'es')).toMatchObject({ name: 'Sin título', blocks: [] });
  });
});

describe('instantiateTemplate', () => {
  it('builds normalized blocks from a template in either language', () => {
    for (const locale of CONTENT_LOCALES) {
      const { blocks, name } = instantiateTemplate(getPageTemplates(locale)[0]);
      expect(name).toBe('SaaS Landing');
      expect(blocks.length).toBeGreaterThan(0);
    }
  });
});

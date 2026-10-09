import { describe, expect, it } from 'vitest';
import {
  getAtPath,
  insertListItem,
  isBlockType,
  listMaxItems,
  moveListItem,
  normalizeBlockData,
  removeListItem,
  setAtPath,
} from '@/lib/block-data';
import { blockRegistry } from '@/lib/block-registry';
import { pageTemplates } from '@/lib/templates';
import type { BlockType } from '@/types/blocks';

const allTypes = Object.keys(blockRegistry).filter(isBlockType);

describe('normalizeBlockData', () => {
  it('fills missing keys with empty values (not sample content)', () => {
    expect(normalizeBlockData('faq', {})).toEqual({ title: '', questions: [] });
    expect(normalizeBlockData('hero', { title: 'Hola' })).toEqual({
      title: 'Hola',
      subtitle: '',
      buttonText: '',
      buttonLink: '',
      badgeText: '',
      secondaryButtonText: '',
      secondaryButtonLink: '',
      backgroundImage: '',
      alignment: 'center',
    });
  });

  it('fills every item with all its keys', () => {
    const data = normalizeBlockData('pricing', { plans: [{ name: 'Pro' }] });
    expect(data.plans).toEqual([
      { name: 'Pro', price: '', features: '', buttonText: '', buttonLink: '', highlighted: false },
    ]);
  });

  it('coerces wrong types to the empty value of the field', () => {
    const data = normalizeBlockData('pricing', {
      title: 42,
      subtitle: null,
      billingPeriod: ['/mes'],
      plans: [{ name: 7, highlighted: 'yes' }],
    });
    expect(data.title).toBe('');
    expect(data.subtitle).toBe('');
    expect(data.billingPeriod).toBe('');
    expect(data.plans[0].name).toBe('');
    expect(data.plans[0].highlighted).toBe(false);
  });

  it('replaces unknown enum values with the fallback', () => {
    expect(normalizeBlockData('hero', { alignment: 'right' }).alignment).toBe('center');
    expect(normalizeBlockData('gallery', { columns: 4 }).columns).toBe('3');
    expect(normalizeBlockData('gallery', { columns: '2' }).columns).toBe('2');
  });

  it('drops unknown keys and list items that are not objects', () => {
    const data = normalizeBlockData('faq', {
      title: 'FAQ',
      extra: 'x',
      questions: [{ question: 'Q', answer: 'A', id: 9 }, 'oops', null, ['q'], { question: 'Q2' }],
    });
    expect(data).toEqual({
      title: 'FAQ',
      questions: [
        { question: 'Q', answer: 'A' },
        { question: 'Q2', answer: '' },
      ],
    });
  });

  it('cuts lists to their maximum', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ question: `Q${i}`, answer: '' }));
    expect(normalizeBlockData('faq', { questions: many }).questions).toHaveLength(12);
    expect(normalizeBlockData('pricing', { plans: many }).plans).toHaveLength(4);
  });

  it('does not convert old numbered data: its lists come out empty', () => {
    const data = normalizeBlockData('features', {
      title: 'Ventajas',
      feature1Title: 'Uno',
      feature1Desc: 'Desc',
    });
    expect(data).toEqual({ title: 'Ventajas', features: [] });
  });

  it('never throws, whatever it is given', () => {
    const inputs: unknown[] = [undefined, null, 'text', 3, [], [1, 2], { features: 'x', links: {}, plans: 5 }];
    for (const type of allTypes) {
      for (const input of inputs) {
        expect(() => normalizeBlockData(type, input)).not.toThrow();
      }
    }
  });

  it('keeps valid data unchanged (registry and templates are already normalized)', () => {
    for (const type of allTypes) {
      const { initialData } = blockRegistry[type];
      expect(normalizeBlockData(type, initialData), type).toEqual(initialData);
    }
    for (const template of pageTemplates) {
      for (const block of template.blocks) {
        const normalized = normalizeBlockData(block.type, block.data);
        expect(normalized, `${template.id}/${block.type}`).toMatchObject(block.data);
      }
    }
  });
});

describe('block registry fields', () => {
  it('list fields hold arrays in initialData and match the schema limits', () => {
    for (const type of allTypes) {
      const { fields, initialData } = blockRegistry[type];
      for (const field of fields) {
        const value = getAtPath(initialData, [field.key]);
        expect(value, `${type}.${field.key}`).not.toBeUndefined();
        if (field.type === 'list') {
          expect(Array.isArray(value)).toBe(true);
          expect(field.maxItems).toBe(listMaxItems(type as BlockType, field.key));
          expect(normalizeBlockData(type, { [field.key]: [field.newItem] })).toMatchObject({ [field.key]: [field.newItem] });
        }
      }
    }
  });
});

describe('paths', () => {
  const data = { title: 'T', features: [{ title: 'A', description: 'a' }, { title: 'B', description: 'b' }] };

  it('reads values at a path', () => {
    expect(getAtPath(data, ['features', 1, 'title'])).toBe('B');
    expect(getAtPath(data, ['features', 5, 'title'])).toBeUndefined();
    expect(getAtPath(data, ['title', 0])).toBeUndefined();
  });

  it('writes a copy and keeps untouched branches', () => {
    const next = setAtPath(data, ['features', 1, 'title'], 'B2');
    expect(getAtPath(next, ['features', 1, 'title'])).toBe('B2');
    expect(data.features[1].title).toBe('B');
    expect(getAtPath(next, ['features', 0])).toBe(data.features[0]);
  });

  it('returns the same object when the slot does not exist', () => {
    expect(setAtPath(data, ['features', 9, 'title'], 'X')).toBe(data);
    expect(setAtPath(data, ['missing'], 'X')).toBe(data);
    expect(setAtPath(data, ['features', 0, 'title'], 'A')).toBe(data);
  });
});

describe('list operations', () => {
  const data = normalizeBlockData('faq', {
    questions: [{ question: '1' }, { question: '2' }, { question: '3' }],
  });
  const questions = (value: unknown) =>
    normalizeBlockData('faq', value).questions.map((q) => q.question);

  it('inserts at the end or at an index', () => {
    expect(questions(insertListItem(data, 'questions', { question: '4' }))).toEqual(['1', '2', '3', '4']);
    expect(questions(insertListItem(data, 'questions', { question: '0' }, 0))).toEqual(['0', '1', '2', '3']);
  });

  it('removes and moves items', () => {
    expect(questions(removeListItem(data, 'questions', 1))).toEqual(['1', '3']);
    expect(questions(moveListItem(data, 'questions', 0, 2))).toEqual(['2', '3', '1']);
    expect(questions(moveListItem(data, 'questions', 2, 1))).toEqual(['1', '3', '2']);
  });

  it('ignores out-of-range indexes and keys that are not lists', () => {
    expect(removeListItem(data, 'questions', 7)).toBe(data);
    expect(moveListItem(data, 'questions', 0, 3)).toBe(data);
    expect(insertListItem(data, 'title', {})).toBe(data);
  });
});

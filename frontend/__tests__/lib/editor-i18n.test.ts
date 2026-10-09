import { describe, expect, it } from 'vitest';
import { blockRegistry, getBlockFields } from '@/lib/block-registry';
import { isBlockType } from '@/lib/block-data';
import { translateFieldDefinition } from '@/lib/editor-i18n';

// Words that are the same in Spanish and English
const SAME_IN_BOTH = new Set(['Plan', 'Logo', 'Copyright']);

function expectTranslated(spanish: string, english: string, where: string) {
  if (SAME_IN_BOTH.has(spanish)) return;
  expect(english, where).not.toBe(spanish);
}

describe('English field labels', () => {
  const types = Object.keys(blockRegistry).filter(isBlockType);

  it('translate every field, list item name and list item field', () => {
    for (const type of types) {
      for (const field of getBlockFields(type)) {
        const english = translateFieldDefinition(field, 'en');
        expectTranslated(field.label, english.label, `${type}.${field.key}`);
        if (field.type !== 'list' || english.type !== 'list') continue;
        expectTranslated(field.itemLabel, english.itemLabel, `${type}.${field.key} item`);
        field.itemFields.forEach((itemField, i) => {
          expectTranslated(itemField.label, english.itemFields[i].label, `${type}.${field.key}.${itemField.key}`);
        });
      }
    }
  });

  it('keeps the Spanish labels for Spanish', () => {
    const faqList = getBlockFields('faq').find((f) => f.type === 'list');
    if (!faqList) throw new Error('faq has no list');
    expect(translateFieldDefinition(faqList, 'es')).toEqual(faqList);
    const english = translateFieldDefinition(faqList, 'en');
    expect(english.type === 'list' && [english.label, english.itemLabel, english.itemFields.map((f) => f.label)]).toEqual([
      'Questions',
      'Question',
      ['Question', 'Answer'],
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BLOCK_FIELD_LIMITS,
  MAX_BLOCK_DATA_BYTES,
  PAGE_FIELD_LIMITS,
  fieldLimit,
  isAcceptedLink,
  normalizeLink,
} from '@/lib/field-limits';
import type { FieldLimit, ListLimit } from '@/lib/field-limits';
import { blockSchemas } from '@/lib/block-data';

// The server's rules, read as text so the two copies cannot drift apart (QA-004)
const validators = readFileSync(resolve(__dirname, '../../../backend/pages/block_validators.py'), 'utf8');
const models = readFileSync(resolve(__dirname, '../../../backend/pages/models.py'), 'utf8');

type ServerRule =
  | { kind: 'string'; maxLength: number; format: FieldLimit['format']; choices: boolean }
  | { kind: 'boolean' }
  | { kind: 'list'; maxItems: number; items: Record<string, ServerRule> };

const constants: Record<string, number> = Object.fromEntries(
  [...validators.matchAll(/^([A-Z_]+) = ([\d_]+)$/gm)].map((m) => [m[1], Number(m[2].replace(/_/g, ''))]),
);

/** Splits `text` at commas that are not inside (), [] or {}. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The text between the bracket at `open` and its match. */
function enclosed(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++;
    if (')]}'.includes(text[i])) depth--;
    if (depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('Unbalanced brackets');
}

const namedRules: Record<string, string> = {};
for (const match of validators.matchAll(/^([A-Z_]+_RULE) = FieldRule\(/gm)) {
  const open = (match.index ?? 0) + match[0].length - 1;
  namedRules[match[1]] = enclosed(validators, open);
}

function parseRule(expr: string): ServerRule {
  const trimmed = expr.trim();
  if (namedRules[trimmed] !== undefined) return parseRule(`FieldRule(${namedRules[trimmed]})`);
  const args = trimmed.startsWith('FieldRule(') ? enclosed(trimmed, trimmed.indexOf('(')) : '';
  const kwargs: Record<string, string> = {};
  for (const part of splitTopLevel(args)) {
    const eq = part.indexOf('=');
    kwargs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  const number = (value: string) => constants[value] ?? Number(value.replace(/_/g, ''));
  if (kwargs.kind === "'boolean'") return { kind: 'boolean' };
  if (kwargs.kind === "'list'") {
    return { kind: 'list', maxItems: number(kwargs.max_items), items: parseDict(kwargs.item_rules) };
  }
  const format = kwargs.safe_link === 'True' ? 'link' : kwargs.safe_url === 'True' ? 'url' : 'text';
  return { kind: 'string', maxLength: number(kwargs.max_length), format, choices: 'choices' in kwargs };
}

function parseDict(text: string): Record<string, ServerRule> {
  const body = enclosed(text, text.indexOf('{'));
  return Object.fromEntries(splitTopLevel(body).map((entry) => {
    const colon = entry.indexOf(':');
    return [entry.slice(0, colon).trim().replace(/'/g, ''), parseRule(entry.slice(colon + 1))];
  }));
}

/** Every block type's rules, by the type name passed to _validate_fields. */
const serverRules: Record<string, Record<string, ServerRule>> = Object.fromEntries(
  [...validators.matchAll(/_validate_fields\('(\w+)', data, \{/g)].map((m) => {
    const open = (m.index ?? 0) + m[0].length - 1;
    return [m[1], parseDict(validators.slice(open))];
  }),
);

/** The part of the server's rules the editor mirrors: text limits and lists (selects and toggles have no length). */
function mirrored(rules: Record<string, ServerRule>): Record<string, FieldLimit | ListLimit> {
  const result: Record<string, FieldLimit | ListLimit> = {};
  for (const [key, rule] of Object.entries(rules)) {
    if (rule.kind === 'boolean') continue;
    if (rule.kind === 'list') {
      result[key] = { maxItems: rule.maxItems, items: mirrored(rule.items) as Record<string, FieldLimit> };
    } else if (!rule.choices) {
      result[key] = { maxLength: rule.maxLength, format: rule.format };
    }
  }
  return result;
}

describe('field limits mirror backend/pages/block_validators.py (QA-004)', () => {
  it('reads a rule for every block type the editor knows', () => {
    expect(Object.keys(serverRules).sort()).toEqual(Object.keys(blockSchemas).sort());
  });

  it.each(Object.keys(BLOCK_FIELD_LIMITS))('%s: same text limits, link fields and list sizes', (type) => {
    expect(BLOCK_FIELD_LIMITS[type as keyof typeof BLOCK_FIELD_LIMITS]).toEqual(mirrored(serverRules[type]));
  });

  it('same size limit for the whole block', () => {
    expect(MAX_BLOCK_DATA_BYTES).toBe(constants.MAX_BLOCK_DATA_BYTES);
  });

  it('page fields have the max_length of the Page model', () => {
    const modelField = (name: string) => Number(new RegExp(`\\b${name} = models\\.\\w+\\(max_length=(\\d+)`).exec(models)?.[1]);
    expect(PAGE_FIELD_LIMITS).toEqual({
      name: modelField('name'),
      seoTitle: modelField('seo_title'),
      seoDescription: modelField('seo_description'),
      seoCanonicalUrl: modelField('seo_canonical_url'),
      ogTitle: modelField('og_title'),
      ogDescription: modelField('og_description'),
      ogImage: modelField('og_image'),
    });
  });
});

describe('fieldLimit', () => {
  it('finds top-level fields and list item fields', () => {
    expect(fieldLimit('hero', ['title'])).toEqual({ maxLength: 200, format: 'text' });
    expect(fieldLimit('hero', ['buttonLink'])).toEqual({ maxLength: 2000, format: 'link' });
    expect(fieldLimit('navbar', ['links', 2, 'url'])).toEqual({ maxLength: 2000, format: 'link' });
    expect(fieldLimit('faq', ['questions', 0, 'answer'])).toEqual({ maxLength: 1000, format: 'text' });
  });

  it('has none for selects, toggles, lists themselves and unknown paths', () => {
    expect(fieldLimit('hero', ['alignment'])).toBeNull();
    expect(fieldLimit('pricing', ['plans', 0, 'highlighted'])).toBeNull();
    expect(fieldLimit('navbar', ['links'])).toBeNull();
    expect(fieldLimit('hero', ['nope'])).toBeNull();
    expect(fieldLimit('hero', [])).toBeNull();
  });
});

describe('normalizeLink (QA-004: example.com is the usual way a save got blocked)', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['www.example.com/precios?x=1#y', 'https://www.example.com/precios?x=1#y'],
    ['  sub.example.co.uk  ', 'https://sub.example.co.uk'],
    ['//cdn.example.com/a', 'https://cdn.example.com/a'],
    ['ana@example.com', 'mailto:ana@example.com'],
  ])('%s -> %s', (typed, expected) => {
    expect(normalizeLink(typed)).toBe(expected);
    expect(isAcceptedLink(normalizeLink(typed))).toBe(true);
  });

  it.each(['https://example.com', '/precios', '#contacto', 'mailto:a@b.co', 'tel:+34600000000', ''])(
    'keeps %s as it is',
    (link) => {
      expect(normalizeLink(link)).toBe(link);
    },
  );

  it('leaves what it cannot fix for the field to flag', () => {
    expect(normalizeLink('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(isAcceptedLink('javascript:alert(1)')).toBe(false);
    expect(normalizeLink('not a link')).toBe('not a link');
    expect(isAcceptedLink('not a link')).toBe(false);
  });
});

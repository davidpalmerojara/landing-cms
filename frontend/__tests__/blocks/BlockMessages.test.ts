import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/lib/i18n';

const dir = join(process.cwd(), 'components', 'blocks');

function lookup(messages: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

/**
 * Every literal t('…') key a block uses exists in its namespace (`blocks`) in
 * both languages (QA-041: a key that only existed under `mobile` left a raw
 * key as the custom HTML frame's title on every published page).
 */
describe('block components only use messages that exist', () => {
  const files = readdirSync(dir).filter((file) => file.endsWith('.tsx'));

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(dir, file), 'utf8');
    const usesBlocks = /useTranslations\('blocks'\)/.test(source);
    if (!usesBlocks) return;
    const keys = [...source.matchAll(/\bt\('([^'$]+)'/g)].map((match) => match[1]);
    // Prefixes of keys built at runtime: t(`contactError.${kind}`)
    const prefixes = [...source.matchAll(/\bt\(`([^`$]+)\$\{/g)].map((match) => match[1].replace(/\.$/, ''));
    for (const locale of ['es', 'en'] as const) {
      for (const key of keys) expect(typeof lookup(MESSAGES[locale].blocks, key), `${locale}: blocks.${key}`).toBe('string');
      for (const prefix of prefixes) expect(typeof lookup(MESSAGES[locale].blocks, prefix), `${locale}: blocks.${prefix}`).toBe('object');
    }
  });
});

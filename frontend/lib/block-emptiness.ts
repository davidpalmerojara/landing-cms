import type { Block } from '@/types/blocks';

/** Fields that choose a layout or point somewhere: with nothing else filled in, they show nothing */
const NON_CONTENT_KEYS = new Set(['alignment', 'columns', 'billingPeriod', 'url']);

function isNonContentKey(key: string): boolean {
  return NON_CONTENT_KEYS.has(key) || key.endsWith('Link');
}

function hasContent(value: unknown, key = ''): boolean {
  if (isNonContentKey(key)) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some((item) => hasContent(item));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([innerKey, inner]) => hasContent(inner, innerKey));
  }
  return false;
}

/**
 * A block whose text and images are all empty. On the published page and in
 * the preview it is left out: it would only be a band of padding (a bare logo
 * square for a footer, a menu button that opens nothing for a navbar), and a
 * heading-less section is no use to a screen reader either (PUBLIC2-009).
 * The editor still shows it, so the block can be filled in.
 */
export function isBlockEmpty(block: Pick<Block, 'data'>): boolean {
  return !hasContent(block.data);
}

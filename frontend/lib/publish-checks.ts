/**
 * What is worth telling the owner when they publish, without stopping them (D9):
 * buttons and menu items that have text but no usable link. On the published
 * page those render as plain text, so the owner should know why.
 */
import { safeHref } from '@/lib/safe-link';
import type { Translate } from '@/lib/api-errors';
import type { Block } from '@/types/blocks';

export interface LinklessItem {
  blockId: string;
  /** The visible text of the button or item */
  label: string;
}

interface Linkable {
  label: string;
  link: string;
}

function linkablesOf(block: Block): Linkable[] {
  switch (block.type) {
    case 'hero':
      return [
        { label: block.data.buttonText, link: block.data.buttonLink },
        { label: block.data.secondaryButtonText, link: block.data.secondaryButtonLink },
      ];
    case 'cta':
      return [{ label: block.data.buttonText, link: block.data.buttonLink }];
    case 'pricing':
      return block.data.plans.map((plan) => ({ label: plan.buttonText, link: plan.buttonLink }));
    case 'navbar':
      return [
        ...block.data.links.map((link) => ({ label: link.label, link: link.url })),
        { label: block.data.ctaText, link: block.data.ctaLink },
      ];
    case 'footer':
      return block.data.links.map((link) => ({ label: link.label, link: link.url }));
    default:
      return [];
  }
}

/**
 * The note to show after publishing, or null when there is nothing to say:
 * an empty page, or buttons that will show as plain text (names the first ones).
 * `phone`: worded for Quick Edit.
 */
export function publishNotice(blocks: Block[], t: Translate, options: { phone?: boolean } = {}): string | null {
  if (blocks.length === 0) return t('publishing.emptyPage');
  const items = linklessItems(blocks);
  if (items.length === 0) return null;
  const names = items.slice(0, 3).map((item) => `“${item.label}”`).join(', ');
  // Quick Edit has no inspector: it points to the block's own sheet (MOBILE2-005)
  return t(options.phone ? 'publishing.linklessPhone' : 'publishing.linkless', { count: items.length, names });
}

/** Buttons and menu items with text but no link a visitor could follow. */
export function linklessItems(blocks: Block[]): LinklessItem[] {
  return blocks.flatMap((block) =>
    linkablesOf(block)
      .filter(({ label, link }) => label.trim() !== '' && safeHref(link) === null)
      .map(({ label }) => ({ blockId: block.id, label: label.trim() })),
  );
}

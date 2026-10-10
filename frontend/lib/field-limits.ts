/**
 * Limits the server enforces on what the user types, mirrored so the editor
 * can stop a value before the server refuses the whole save (QA-004).
 *
 * The server is the real gate (backend/pages/block_validators.py for block
 * data, backend/pages/models.py for page fields); these tables only make the
 * editor say so first. `__tests__/lib/field-limits.test.ts` reads the Python
 * files and fails if the two drift apart.
 *
 *   fieldLimit('hero', ['title'])           -> { maxLength: 200, format: 'text' }
 *   fieldLimit('navbar', ['links', 0, 'url']) -> { maxLength: 2000, format: 'link' }
 *   normalizeLink('example.com')            -> 'https://example.com'
 */
import { safeHref } from '@/lib/safe-link';
import type { BlockType, DataPath } from '@/types/block-data';

/** `link`: a followable href (buttons, menus); `url`: an image address; `text`: anything else. */
export type FieldFormat = 'text' | 'link' | 'url';

export interface FieldLimit {
  maxLength: number;
  format: FieldFormat;
}

export interface ListLimit {
  maxItems: number;
  items: Record<string, FieldLimit>;
}

type BlockLimits = Record<string, FieldLimit | ListLimit>;

// Same names and values as block_validators.py
export const PLAIN_TEXT_MAX = 200;
export const RICH_TEXT_MAX = 500;
export const BUTTON_TEXT_MAX = 50;
export const PLACEHOLDER_MAX = 100;
export const NAME_MAX = 100;
export const QUOTE_MAX = 500;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 1000;
export const ALT_TEXT_MAX = 300;
export const COPYRIGHT_MAX = 200;
export const CUSTOM_HTML_MAX = 50_000;
export const LINK_MAX = 2000;
/** The whole data object of one block, serialized as JSON (UTF-8 bytes). */
export const MAX_BLOCK_DATA_BYTES = 64_000;

const text = (maxLength: number): FieldLimit => ({ maxLength, format: 'text' });
const PLAIN = text(PLAIN_TEXT_MAX);
const RICH = text(RICH_TEXT_MAX);
const BUTTON = text(BUTTON_TEXT_MAX);
const PLACEHOLDER = text(PLACEHOLDER_MAX);
const NAME = text(NAME_MAX);
const LINK: FieldLimit = { maxLength: LINK_MAX, format: 'link' };
const URL: FieldLimit = { maxLength: LINK_MAX, format: 'url' };
const LINKS: ListLimit = { maxItems: 6, items: { label: PLAIN, url: LINK } };

export const BLOCK_FIELD_LIMITS: Record<BlockType, BlockLimits> = {
  navbar: { brandName: NAME, logoImage: URL, links: LINKS, ctaText: BUTTON, ctaLink: LINK },
  hero: {
    title: PLAIN,
    subtitle: RICH,
    buttonText: BUTTON,
    buttonLink: LINK,
    badgeText: BUTTON,
    secondaryButtonText: BUTTON,
    secondaryButtonLink: LINK,
    backgroundImage: URL,
  },
  features: { title: PLAIN, features: { maxItems: 6, items: { title: PLAIN, description: RICH } } },
  testimonials: {
    title: PLAIN,
    testimonials: { maxItems: 6, items: { quote: text(QUOTE_MAX), author: NAME, role: PLAIN } },
  },
  cta: { title: PLAIN, subtitle: RICH, buttonText: BUTTON, buttonLink: LINK },
  footer: { brandName: NAME, description: RICH, copyright: text(COPYRIGHT_MAX), links: LINKS },
  pricing: {
    title: PLAIN,
    subtitle: RICH,
    plans: {
      maxItems: 4,
      items: { name: NAME, price: PLAIN, features: text(FAQ_ANSWER_MAX), buttonText: BUTTON, buttonLink: LINK },
    },
    billingPeriod: PLAIN,
    popularBadgeText: BUTTON,
  },
  faq: {
    title: PLAIN,
    questions: { maxItems: 12, items: { question: text(FAQ_QUESTION_MAX), answer: text(FAQ_ANSWER_MAX) } },
  },
  logoCloud: { title: PLAIN, logos: { maxItems: 12, items: { name: NAME } } },
  gallery: { title: PLAIN, subtitle: RICH, images: { maxItems: 12, items: { src: URL, alt: text(ALT_TEXT_MAX) } } },
  contact: {
    title: PLAIN,
    subtitle: RICH,
    buttonText: BUTTON,
    namePlaceholder: PLACEHOLDER,
    emailPlaceholder: PLACEHOLDER,
    messagePlaceholder: PLACEHOLDER,
  },
  customHtml: { html: text(CUSTOM_HTML_MAX) },
  team: { title: PLAIN, subtitle: RICH, members: { maxItems: 8, items: { name: NAME, role: PLAIN, image: URL } } },
  stats: { title: PLAIN, subtitle: RICH, stats: { maxItems: 6, items: { value: PLAIN, label: PLAIN } } },
  timeline: {
    title: PLAIN,
    events: { maxItems: 10, items: { date: PLAIN, title: PLAIN, description: RICH } },
  },
};

/** Page fields (backend/pages/models.py max_length), by their name in the editor's Page. */
export const PAGE_FIELD_LIMITS = {
  name: 200,
  seoTitle: 70,
  seoDescription: 160,
  seoCanonicalUrl: 500,
  ogTitle: 200,
  ogDescription: 300,
  ogImage: 500,
} as const;

function isListLimit(limit: FieldLimit | ListLimit): limit is ListLimit {
  return 'items' in limit;
}

/** The limit of the text field at `path` in a block's data, or null when it has none (selects, toggles). */
export function fieldLimit(type: BlockType, path: DataPath): FieldLimit | null {
  const limits = BLOCK_FIELD_LIMITS[type];
  if (!limits || path.length === 0) return null;
  const top = limits[String(path[0])];
  if (!top) return null;
  if (!isListLimit(top)) return path.length === 1 ? top : null;
  // A list item's field: [listKey, index, itemKey]
  if (path.length !== 3 || typeof path[1] !== 'number') return null;
  return top.items[String(path[2])] ?? null;
}

const LOOKS_LIKE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;
const LOOKS_LIKE_EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[a-z]{2,}$/i;

/**
 * What people usually mean when they type a link without its scheme:
 * `example.com` and `www.example.com/x` become `https://...`, `ana@example.com`
 * becomes `mailto:ana@example.com`, `//cdn.example.com` becomes `https://...`.
 * Surrounding spaces are removed. Anything else comes back trimmed, unchanged.
 */
export function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || safeHref(trimmed)) return trimmed;
  if (trimmed.startsWith('//') && LOOKS_LIKE_DOMAIN.test(trimmed.slice(2))) return `https:${trimmed}`;
  if (LOOKS_LIKE_EMAIL.test(trimmed)) return `mailto:${trimmed}`;
  if (LOOKS_LIKE_DOMAIN.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** True when the server will accept `value` as a link (empty counts as valid: no link). */
export function isAcceptedLink(value: string): boolean {
  return value === '' || safeHref(value) !== null;
}


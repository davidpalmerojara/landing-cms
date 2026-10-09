/**
 * Runtime shape of every block's data, and the boundary function that turns
 * untrusted input (API, WebSocket, AI output, old local backups) into it.
 *
 * Kept free of React imports: the store uses it, and the block registry
 * imports components that import the store.
 */
import type {
  BlockData,
  BlockDataMap,
  BlockType,
  DataPath,
  FaqItem,
  FeatureItem,
  GalleryImage,
  ItemOf,
  LinkItem,
  LogoItem,
  PricingPlan,
  StatItem,
  TeamMember,
  TestimonialItem,
  TimelineEvent,
} from '@/types/block-data';
import type { Block, BlockBase, BlockOf, BlockStyles, ResponsiveStyles } from '@/types/blocks';
import { defaultBlockStyles } from '@/types/blocks';

// --- Schema DSL ---

interface StringRule { kind: 'string' }
interface BooleanRule { kind: 'boolean' }
interface EnumRule<V extends string> { kind: 'enum'; values: readonly V[]; fallback: V }
interface ListRule<I> { kind: 'list'; max: number; item: ItemSchema<I> }

type ScalarRule = StringRule | BooleanRule | EnumRule<string>;
/** Rules seen without their block type, as the normalizer walks them. */
type AnyRule = ScalarRule | { kind: 'list'; max: number; item: Record<string, ScalarRule> };

/** Rule for a field of type V (wrapped in tuples so unions are not distributed). */
type ScalarRuleFor<V> = [V] extends [boolean]
  ? BooleanRule
  : string extends V
    ? StringRule
    : [V] extends [string]
      ? EnumRule<V>
      : never;

/** Schema of a list item: one scalar rule per key. */
type ItemSchema<I> = { [P in keyof I]-?: ScalarRuleFor<I[P]> };

/** Schema of a block's data, checked against its interface by the compiler. */
type DataSchema<T> = {
  [P in keyof T]-?: T[P] extends readonly unknown[] ? ListRule<ItemOf<T[P]>> : ScalarRuleFor<T[P]>;
};

const text: StringRule = { kind: 'string' };
const flag: BooleanRule = { kind: 'boolean' };
const list = <I>(max: number, item: ItemSchema<I>): ListRule<I> => ({ kind: 'list', max, item });

const linkItem: ItemSchema<LinkItem> = { label: text, url: text };

/** Limits match the backend validators (CONTRACT.md). */
export const blockSchemas: { [K in BlockType]: DataSchema<BlockDataMap[K]> } = {
  hero: {
    title: text,
    subtitle: text,
    buttonText: text,
    buttonLink: text,
    badgeText: text,
    secondaryButtonText: text,
    secondaryButtonLink: text,
    backgroundImage: text,
    alignment: { kind: 'enum', values: ['center', 'left'], fallback: 'center' },
  },
  features: { title: text, features: list<FeatureItem>(6, { title: text, description: text }) },
  testimonials: { title: text, testimonials: list<TestimonialItem>(6, { quote: text, author: text, role: text }) },
  cta: { title: text, subtitle: text, buttonText: text, buttonLink: text },
  footer: { brandName: text, description: text, copyright: text, links: list<LinkItem>(6, linkItem) },
  pricing: {
    title: text,
    subtitle: text,
    billingPeriod: text,
    popularBadgeText: text,
    plans: list<PricingPlan>(4, { name: text, price: text, features: text, buttonText: text, buttonLink: text, highlighted: flag }),
  },
  faq: { title: text, questions: list<FaqItem>(12, { question: text, answer: text }) },
  logoCloud: { title: text, logos: list<LogoItem>(12, { name: text }) },
  gallery: {
    title: text,
    subtitle: text,
    columns: { kind: 'enum', values: ['2', '3', '4'], fallback: '3' },
    images: list<GalleryImage>(12, { src: text, alt: text }),
  },
  contact: {
    title: text,
    subtitle: text,
    buttonText: text,
    namePlaceholder: text,
    emailPlaceholder: text,
    messagePlaceholder: text,
  },
  customHtml: { html: text },
  navbar: { brandName: text, logoImage: text, links: list<LinkItem>(6, linkItem), ctaText: text, ctaLink: text },
  team: { title: text, subtitle: text, members: list<TeamMember>(8, { name: text, role: text, image: text }) },
  stats: { title: text, subtitle: text, stats: list<StatItem>(6, { value: text, label: text }) },
  timeline: { title: text, events: list<TimelineEvent>(10, { date: text, title: text, description: text }) },
};

// --- Normalization ---

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(blockSchemas, value);
}

function normalizeScalar(rule: ScalarRule, raw: unknown): string | boolean {
  switch (rule.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : false;
    case 'enum':
      return typeof raw === 'string' && rule.values.includes(raw) ? raw : rule.fallback;
    default:
      return typeof raw === 'string' ? raw : '';
  }
}

function normalizeRecord(schema: Record<string, AnyRule>, raw: unknown): Record<string, unknown> {
  const source = isPlainObject(raw) ? raw : {};
  const result: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(schema)) {
    const value = source[key];
    if (rule.kind === 'list') {
      const items = Array.isArray(value) ? value.filter(isPlainObject) : [];
      result[key] = items.slice(0, rule.max).map((item) => normalizeRecord(rule.item, item));
    } else {
      result[key] = normalizeScalar(rule, value);
    }
  }
  return result;
}

/**
 * Turns any value into valid data for `type`: every key present, wrong types
 * replaced by the empty value of the field ('' / false / [] / the enum
 * fallback), unknown keys dropped, list items that are not objects dropped and
 * lists cut to their maximum. Never throws.
 *
 * Missing keys get empty values, not the sample content of a new block, so
 * partial data (templates, AI output) renders the same as before.
 * Old numbered data (feature1Title...) is not converted (the server migration
 * does that): its lists come out empty and the block renders without them.
 */
export function normalizeBlockData<K extends BlockType>(type: K, raw: unknown): BlockDataMap[K] {
  const schema: Record<string, AnyRule> = blockSchemas[type];
  // The schema is typed against BlockDataMap[K], so the record built from it has that shape.
  return normalizeRecord(schema, raw) as unknown as BlockDataMap[K];
}

/** A block of `type` whose data is `rawData` normalized for that type. */
export function makeBlock<K extends BlockType>(base: BlockBase, type: K, rawData: unknown): Block {
  const block: BlockOf<K> = {
    id: base.id,
    name: base.name,
    styles: base.styles,
    ...(base.responsiveStyles ? { responsiveStyles: base.responsiveStyles } : {}),
    type,
    data: normalizeBlockData(type, rawData),
  };
  // BlockOf<K> is a member of the Block union; the compiler cannot pick which for a generic K.
  return block as Block;
}

/** `block` with new data (normalized for its type). */
export function withBlockData(block: Block, rawData: unknown): Block {
  return makeBlock(block, block.type, rawData);
}

/**
 * Styles as the API sends them (per-device overrides inside `responsive`)
 * split into the editor's base styles and responsive styles.
 */
export function splitApiStyles(raw: unknown): { styles: BlockStyles; responsiveStyles?: ResponsiveStyles } {
  const { responsive, ...base } = isPlainObject(raw) ? raw : {};
  return {
    styles: { ...defaultBlockStyles, ...base } as BlockStyles,
    ...(isPlainObject(responsive) ? { responsiveStyles: responsive as ResponsiveStyles } : {}),
  };
}

/** A block's styles in the API's shape: per-device overrides travel inside `responsive`. */
export function blockStylesToApi(block: Pick<Block, 'styles' | 'responsiveStyles'>): Record<string, unknown> {
  return {
    ...block.styles,
    ...(block.responsiveStyles ? { responsive: block.responsiveStyles } : {}),
  };
}

/** Maximum number of items of a list field, or 0 when `key` is not a list. */
export function listMaxItems(type: BlockType, key: string): number {
  const schema: Record<string, AnyRule> = blockSchemas[type];
  const rule = schema[key];
  return rule?.kind === 'list' ? rule.max : 0;
}

// --- Paths inside data ---

/** Value at `path`, or undefined when the path does not exist. */
export function getAtPath(root: unknown, path: DataPath): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      if (!isPlainObject(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

/**
 * Copy of `root` with `value` at `path`. Only existing slots are replaced:
 * a path whose parent is missing, or an index out of range, returns `root`
 * itself (same reference) so callers can detect the no-op.
 */
export function setAtPath(root: unknown, path: DataPath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === 'number') {
    if (!Array.isArray(root) || head < 0 || head >= root.length) return root;
    const child = setAtPath(root[head], rest, value);
    if (child === root[head]) return root;
    const copy = [...root];
    copy[head] = child;
    return copy;
  }
  if (!isPlainObject(root) || !(head in root)) return root;
  const child = setAtPath(root[head], rest, value);
  if (child === root[head]) return root;
  return { ...root, [head]: child };
}

/** Stable string for a path, used for history coalescing and element ids. */
export function pathKey(path: DataPath): string {
  return path.join('.');
}

// --- List operations (pure) ---

function listAt(data: BlockData, key: string): unknown[] | null {
  const value = getAtPath(data, [key]);
  return Array.isArray(value) ? value : null;
}

/** `data` with `item` inserted in list `key` at `index` (end when omitted). */
export function insertListItem(data: BlockData, key: string, item: unknown, index?: number): unknown {
  const items = listAt(data, key);
  if (!items) return data;
  const at = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));
  return { ...data, [key]: [...items.slice(0, at), item, ...items.slice(at)] };
}

/** `data` without item `index` of list `key`. */
export function removeListItem(data: BlockData, key: string, index: number): unknown {
  const items = listAt(data, key);
  if (!items || index < 0 || index >= items.length) return data;
  return { ...data, [key]: items.filter((_, i) => i !== index) };
}

/** `data` with item `from` of list `key` moved to position `to`. */
export function moveListItem(data: BlockData, key: string, from: number, to: number): unknown {
  const items = listAt(data, key);
  if (!items || from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return data;
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return { ...data, [key]: copy };
}

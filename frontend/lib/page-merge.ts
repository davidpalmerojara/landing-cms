/**
 * Three-way merge of a page (S10 contract, "Client merge").
 *
 * `base` is the last state the client knows the server had, `local` the
 * editor's state and `remote` the server's current state. A value changed
 * locally (differs from base) wins; anything else comes from remote. Blocks
 * are matched by id (ADR-014); an edit is never lost to a delete.
 *
 * Pure: no store, no React. Every function returns new objects or the inputs
 * themselves, never mutates.
 */
import { isPlainObject, makeBlock } from '@/lib/block-data';
import type { DesignTokens } from '@/lib/design-tokens';
import type { Block, BlockStyles } from '@/types/blocks';
import type { Page, SeoFields } from '@/types/page';
import { defaultSeoFields } from '@/types/page';

// --- Equality ---

/** Structural equality of JSON-like values (objects by keys, arrays by items). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // A key holding undefined is the same as a missing key (JSON drops both)
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

/** The parts of a block that are saved: type, data, styles and per-device styles. */
export function sameBlockContent(a: Block, b: Block): boolean {
  return (
    a.type === b.type &&
    deepEqual(a.data, b.data) &&
    deepEqual(a.styles, b.styles) &&
    deepEqual(a.responsiveStyles ?? null, b.responsiveStyles ?? null)
  );
}

/** Two pages that would be saved identically: what a PUT sends, block order included. */
export function samePageContent(a: Page, b: Page): boolean {
  return (
    a.name === b.name &&
    deepEqual(a.designTokens, b.designTokens) &&
    deepEqual(a.seo ?? defaultSeoFields, b.seo ?? defaultSeoFields) &&
    a.blocks.length === b.blocks.length &&
    a.blocks.every((block, i) => block.id === b.blocks[i].id && sameBlockContent(block, b.blocks[i]))
  );
}

// --- Values ---

/** Local value if it changed since base, otherwise remote. */
function pick<T>(base: T, local: T, remote: T): T {
  return deepEqual(local, base) ? remote : local;
}

/** Key-by-key merge of two flat records; lists and nested objects are one value. */
function mergeRecord(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const value = pick(base[key], local[key], remote[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function mergeTokens(base: DesignTokens, local: DesignTokens, remote: DesignTokens): DesignTokens {
  // Per leaf: one person can change the primary color while another changes the font
  const groups = ['colors', 'typography', 'spacing', 'borders'] as const;
  const merged = { ...remote };
  for (const group of groups) {
    const record = mergeRecord(
      { ...base[group] } as Record<string, unknown>,
      { ...local[group] } as Record<string, unknown>,
      { ...remote[group] } as Record<string, unknown>,
    );
    // Each group keeps its shape: its keys come from three values of that same group type
    Object.assign(merged, { [group]: record });
  }
  return merged;
}

function mergeSeo(base: SeoFields, local: SeoFields, remote: SeoFields): SeoFields {
  const result: SeoFields = { ...remote };
  for (const key of Object.keys(defaultSeoFields) as (keyof SeoFields)[]) {
    Object.assign(result, { [key]: pick(base[key], local[key], remote[key]) });
  }
  return result;
}

// --- Blocks ---

/** A block modified on both sides: per data key and per style key. */
export function mergeBlock(base: Block, local: Block, remote: Block): Block {
  if (sameBlockContent(local, base)) return remote;
  if (sameBlockContent(remote, base)) return local;

  // A type change (AI edit) rewrites all the data: keys of two types don't mix
  if (local.type !== remote.type) return local.type !== base.type ? local : remote;

  const data = mergeRecord(
    base.type === local.type ? (base.data as unknown as Record<string, unknown>) : {},
    local.data as unknown as Record<string, unknown>,
    remote.data as unknown as Record<string, unknown>,
  );
  const styles = mergeRecord(
    base.styles as unknown as Record<string, unknown>,
    local.styles as unknown as Record<string, unknown>,
    remote.styles as unknown as Record<string, unknown>,
  ) as unknown as BlockStyles;
  // Per-device overrides travel as one style key ("responsive") in the API
  const responsiveStyles = pick(base.responsiveStyles, local.responsiveStyles, remote.responsiveStyles);

  return makeBlock(
    { id: local.id, name: local.name, styles, ...(responsiveStyles ? { responsiveStyles } : {}) },
    local.type,
    data,
  );
}

function byId(blocks: Block[]): Map<string, Block> {
  return new Map(blocks.map((b) => [b.id, b]));
}

/** The merged version of each block id, or nothing when it is deleted. */
function mergeBlockSet(base: Block[], local: Block[], remote: Block[]): Map<string, Block> {
  const baseMap = byId(base);
  const localMap = byId(local);
  const remoteMap = byId(remote);
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const result = new Map<string, Block>();

  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);

    if (l && r) {
      // Present on both sides (also when both added the same id: local wins)
      result.set(id, b ? mergeBlock(b, l, r) : l);
    } else if (l) {
      // Added locally, or deleted remotely: kept if new or edited here
      if (!b || !sameBlockContent(l, b)) result.set(id, l);
    } else if (r) {
      // Added remotely, or deleted locally: kept if new or edited there
      if (!b || !sameBlockContent(r, b)) result.set(id, r);
    }
    // Only in base: deleted on both sides
  }
  return result;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Order of the merged blocks. The shared blocks (in base, local and remote)
 * follow the local order if it was changed, the remote one otherwise. Every
 * other block goes right after its previous neighbour on the side it comes from.
 */
function mergeOrder(base: Block[], local: Block[], remote: Block[], kept: Map<string, Block>): string[] {
  const localIds = local.map((b) => b.id);
  const remoteIds = remote.map((b) => b.id);
  const inLocal = new Set(localIds);
  const inRemote = new Set(remoteIds);
  const baseIds = base.map((b) => b.id);
  const shared = new Set(baseIds.filter((id) => inLocal.has(id) && inRemote.has(id)));

  const localMoved = !sameOrder(
    localIds.filter((id) => shared.has(id)),
    baseIds.filter((id) => shared.has(id)),
  );
  const [primary, other] = localMoved ? [localIds, remoteIds] : [remoteIds, localIds];

  const order = primary.filter((id) => kept.has(id));
  const placed = new Set(order);
  for (let i = 0; i < other.length; i++) {
    const id = other[i];
    if (placed.has(id) || !kept.has(id)) continue;
    // Previous neighbour on this side that is already placed (start of page if none)
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const index = order.indexOf(other[j]);
      if (index !== -1 && placed.has(other[j])) {
        at = index + 1;
        break;
      }
    }
    order.splice(at, 0, id);
    placed.add(id);
  }
  return order;
}

// --- Page ---

/**
 * Three-way merge of a page. Page fields (name, each SEO field, each design
 * token) and block keys take the local value when it changed since `base`,
 * the remote one otherwise. Read-only fields (status, slug, publication) always
 * come from `remote`.
 */
export function mergePages(base: Page, local: Page, remote: Page): Page {
  const kept = mergeBlockSet(base.blocks, local.blocks, remote.blocks);
  const order = mergeOrder(base.blocks, local.blocks, remote.blocks, kept);
  const blocks = order.flatMap((id) => {
    const block = kept.get(id);
    return block ? [block] : [];
  });

  return {
    ...remote,
    name: pick(base.name, local.name, remote.name),
    designTokens: mergeTokens(base.designTokens, local.designTokens, remote.designTokens),
    seo: mergeSeo(
      base.seo ?? defaultSeoFields,
      local.seo ?? defaultSeoFields,
      remote.seo ?? defaultSeoFields,
    ),
    blocks,
  };
}

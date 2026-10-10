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
import type { Block, BlockStyles, ResponsiveStyles } from '@/types/blocks';
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

/**
 * The merged version of each block id, or nothing when it is deleted.
 * `remoteDeletesWin`: a block deleted remotely goes even if local differs
 * from base (used to rebase undo snapshots, whose differences are history,
 * not pending edits).
 */
function mergeBlockSet(base: Block[], local: Block[], remote: Block[], remoteDeletesWin = false): Map<string, Block> {
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
      if (!b || (!remoteDeletesWin && !sameBlockContent(l, b))) result.set(id, l);
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
  return merge(base, local, remote, false);
}

/**
 * An undo/redo snapshot brought up to date with the server (QA-034). Same as
 * mergePages, except that a block someone else deleted is gone from the
 * snapshot too: the snapshot differs from base because it is an older state
 * of our own history, and undoing must never bring back someone else's delete.
 */
export function rebaseSnapshot(base: Page, snapshot: Page, remote: Page): Page {
  return merge(base, snapshot, remote, true);
}

function merge(base: Page, local: Page, remote: Page, remoteDeletesWin: boolean): Page {
  const kept = mergeBlockSet(base.blocks, local.blocks, remote.blocks, remoteDeletesWin);
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

// --- Live relays ---

/**
 * What another connection's live relay (`block_updated`) put on screen in one
 * block and no save has confirmed yet (QA-032, QA-033). Only the fields the
 * relay changed: the rest of the block is still ours.
 */
export interface RelayedEdit {
  /** The relaying connection: the block's lock holder */
  connectionId: string;
  /** Changed data keys and their relayed values */
  data: Record<string, unknown>;
  /** Present when the relay changed the base styles */
  styles?: BlockStyles;
  /** Present when the relay changed the per-device styles (null: none) */
  responsiveStyles?: ResponsiveStyles | null;
}

/** Relayed edits by block id. */
export type RelayedEdits = Record<string, RelayedEdit>;

/** The fields that differ from `current` to `next` (the same block), or null when none do. */
export function relayedChanges(current: Block, next: Block, connectionId: string): RelayedEdit | null {
  const data: Record<string, unknown> = {};
  const currentData = current.data as unknown as Record<string, unknown>;
  const nextData = next.data as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(currentData), ...Object.keys(nextData)])) {
    if (!deepEqual(currentData[key], nextData[key])) data[key] = nextData[key];
  }
  const edit: RelayedEdit = { connectionId, data };
  if (!deepEqual(current.styles, next.styles)) edit.styles = next.styles;
  if (!deepEqual(current.responsiveStyles ?? null, next.responsiveStyles ?? null)) {
    edit.responsiveStyles = next.responsiveStyles ?? null;
  }
  const changed = Object.keys(data).length > 0 || edit.styles !== undefined || edit.responsiveStyles !== undefined;
  return changed ? edit : null;
}

/** A later relay of the same connection on top of an earlier one. */
export function combineRelayedEdits(earlier: RelayedEdit, later: RelayedEdit): RelayedEdit {
  const combined: RelayedEdit = { connectionId: later.connectionId, data: { ...earlier.data, ...later.data } };
  const styles = later.styles ?? earlier.styles;
  if (styles !== undefined) combined.styles = styles;
  const responsiveStyles = later.responsiveStyles !== undefined ? later.responsiveStyles : earlier.responsiveStyles;
  if (responsiveStyles !== undefined) combined.responsiveStyles = responsiveStyles;
  return combined;
}

/** `block` with the fields of `edit` written in; the same object when nothing differs. */
export function applyRelayedEdit(block: Block, edit: RelayedEdit): Block {
  const data: Record<string, unknown> = { ...(block.data as unknown as Record<string, unknown>) };
  let changed = false;
  for (const [key, value] of Object.entries(edit.data)) {
    if (deepEqual(data[key], value)) continue;
    if (value === undefined) delete data[key];
    else data[key] = value;
    changed = true;
  }
  let styles = block.styles;
  if (edit.styles !== undefined && !deepEqual(styles, edit.styles)) {
    styles = edit.styles;
    changed = true;
  }
  let responsiveStyles = block.responsiveStyles;
  if (edit.responsiveStyles !== undefined && !deepEqual(responsiveStyles ?? null, edit.responsiveStyles)) {
    responsiveStyles = edit.responsiveStyles ?? undefined;
    changed = true;
  }
  if (!changed) return block;
  return makeBlock(
    { id: block.id, name: block.name, styles, ...(responsiveStyles ? { responsiveStyles } : {}) },
    block.type,
    data,
  );
}

/** `page` with each relayed edit written into its block (blocks without an edit untouched). */
export function applyRelayedEdits(page: Page, relayed: RelayedEdits): Page {
  if (Object.keys(relayed).length === 0) return page;
  let changed = false;
  const blocks = page.blocks.map((block) => {
    const edit = relayed[block.id];
    const next = edit ? applyRelayedEdit(block, edit) : block;
    if (next !== block) changed = true;
    return next;
  });
  return changed ? { ...page, blocks } : page;
}

/**
 * `page` as this editor would save it: every field that still shows a value
 * relayed live by someone else takes `base`'s value instead. Relayed text is
 * the holder's to save; sending it as ours would store text its author may
 * never have saved (QA-033). A field changed here after the relay is ours.
 */
export function withoutRelayedEdits(page: Page, base: Page, relayed: RelayedEdits): Page {
  if (Object.keys(relayed).length === 0) return page;
  const baseBlocks = byId(base.blocks);
  const reverts: RelayedEdits = {};
  for (const block of page.blocks) {
    const edit = relayed[block.id];
    const original = baseBlocks.get(block.id);
    if (!edit || !original || original.type !== block.type) continue;

    const data = block.data as unknown as Record<string, unknown>;
    const originalData = original.data as unknown as Record<string, unknown>;
    const revert: RelayedEdit = { connectionId: edit.connectionId, data: {} };
    for (const [key, value] of Object.entries(edit.data)) {
      if (deepEqual(data[key], value)) revert.data[key] = originalData[key];
    }
    if (edit.styles !== undefined && deepEqual(block.styles, edit.styles)) revert.styles = original.styles;
    if (edit.responsiveStyles !== undefined && deepEqual(block.responsiveStyles ?? null, edit.responsiveStyles)) {
      revert.responsiveStyles = original.responsiveStyles ?? null;
    }
    reverts[block.id] = revert;
  }
  return applyRelayedEdits(page, reverts);
}

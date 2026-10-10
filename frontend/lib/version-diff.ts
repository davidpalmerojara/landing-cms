/**
 * What changed between the current page and a saved version, block by block.
 * Blocks keep their id across saves and restores (ADR-014, QA-012), so they
 * are matched by id: a block that only changed place is "moved", not removed
 * here and added there (QA-075). Snapshots without ids fall back to matching
 * by type and position.
 */
import { isBlockType, normalizeBlockData, splitApiStyles } from '@/lib/block-data';
import { deepEqual } from '@/lib/page-merge';

export interface DiffableBlock {
  id?: string;
  type: string;
  data: unknown;
  styles: unknown;
}

export type DiffStatus = 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';

export interface DiffBlock<T extends DiffableBlock> {
  block: T;
  status: DiffStatus;
}

function blockKey(block: DiffableBlock, index: number, useIds: boolean): string {
  return useIds && block.id ? `id:${block.id}` : `${block.type}:${index}`;
}

/**
 * A block's content as the editor reads it: stored data may lack optional
 * fields (pages made through the API, seed data) that the editor fills in, so
 * both sides are normalized before comparing (EDITOR2-012). Styles are in the
 * API shape (per-device overrides inside `responsive`).
 */
function comparable(block: DiffableBlock): { data: unknown; styles: unknown } {
  if (!isBlockType(block.type)) return { data: block.data, styles: block.styles };
  return { data: normalizeBlockData(block.type, block.data), styles: splitApiStyles(block.styles) };
}

function contentChanged(a: DiffableBlock, b: DiffableBlock): boolean {
  const left = comparable(a);
  const right = comparable(b);
  return !deepEqual(left.data, right.data) || !deepEqual(left.styles, right.styles);
}

/**
 * The blocks that changed place. Of the blocks both sides have, the longest
 * run that kept its relative order stayed put; the rest moved. Moving one
 * block to the top marks that block only, not every block it passed.
 */
function movedKeys(currentKeys: string[], versionKeys: string[], shared: Set<string>): Set<string> {
  const versionIndex = new Map(versionKeys.filter((k) => shared.has(k)).map((k, i) => [k, i]));
  const sequence = currentKeys.filter((k) => shared.has(k));
  // Longest increasing subsequence of version positions, O(n²): pages have at most a few dozen blocks
  const length = sequence.map(() => 1);
  const previous = sequence.map(() => -1);
  for (let i = 0; i < sequence.length; i++) {
    for (let j = 0; j < i; j++) {
      if (versionIndex.get(sequence[j])! < versionIndex.get(sequence[i])! && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        previous[i] = j;
      }
    }
  }
  const kept = new Set<string>();
  let at = length.indexOf(Math.max(0, ...length));
  while (at >= 0) {
    kept.add(sequence[at]);
    at = previous[at];
  }
  return new Set(sequence.filter((k) => !kept.has(k)));
}

export function computeVersionDiff<C extends DiffableBlock, V extends DiffableBlock>(
  currentBlocks: C[],
  versionBlocks: V[],
): { currentDiff: DiffBlock<C>[]; versionDiff: DiffBlock<V>[] } {
  const useIds = [...currentBlocks, ...versionBlocks].every((b) => typeof b.id === 'string' && b.id !== '');
  const currentKeys = currentBlocks.map((b, i) => blockKey(b, i, useIds));
  const versionKeys = versionBlocks.map((b, i) => blockKey(b, i, useIds));
  const currentByKey = new Map(currentKeys.map((k, i) => [k, currentBlocks[i]]));
  const versionByKey = new Map(versionKeys.map((k, i) => [k, versionBlocks[i]]));
  const shared = new Set(currentKeys.filter((k) => versionByKey.has(k)));
  const moved = useIds ? movedKeys(currentKeys, versionKeys, shared) : new Set<string>();

  const statusOf = (key: string, block: DiffableBlock, other: DiffableBlock | undefined, missing: DiffStatus): DiffStatus => {
    if (!other) return missing;
    if (contentChanged(block, other)) return 'modified';
    return moved.has(key) ? 'moved' : 'unchanged';
  };

  return {
    currentDiff: currentBlocks.map((block, i) => ({
      block,
      status: statusOf(currentKeys[i], block, versionByKey.get(currentKeys[i]), 'added'),
    })),
    versionDiff: versionBlocks.map((block, i) => ({
      block,
      status: statusOf(versionKeys[i], block, currentByKey.get(versionKeys[i]), 'removed'),
    })),
  };
}

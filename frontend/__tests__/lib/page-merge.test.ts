import { describe, it, expect } from 'vitest';
import { deepEqual, mergeBlock, mergePages, samePageContent } from '@/lib/page-merge';
import { makeBlock } from '@/lib/block-data';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { defaultBlockStyles } from '@/types/blocks';
import type { Block, BlockStyles, BlockType } from '@/types/blocks';
import { defaultSeoFields } from '@/types/page';
import type { Page } from '@/types/page';

// --- Builders ---

function block(id: string, type: BlockType = 'cta', data: Record<string, unknown> = {}, styles: Partial<BlockStyles> = {}): Block {
  return makeBlock({ id, name: type, styles: { ...defaultBlockStyles, ...styles } }, type, { title: id.toUpperCase(), ...data });
}

function page(blocks: Block[], overrides: Partial<Page> = {}): Page {
  return {
    id: 'p1',
    name: 'Landing',
    status: 'draft',
    slug: 'landing',
    designTokens: cloneDesignTokens(defaultDesignTokens),
    seo: { ...defaultSeoFields },
    blocks,
    ...overrides,
  };
}

/** `p` with block `id` changed by `update`. */
function edit(p: Page, id: string, data: Record<string, unknown>, styles: Partial<BlockStyles> = {}): Page {
  return {
    ...p,
    blocks: p.blocks.map((b) => (b.id === id
      ? makeBlock({ ...b, styles: { ...b.styles, ...styles } }, b.type, { ...b.data, ...data })
      : b)),
  };
}

const without = (p: Page, id: string): Page => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) });
const ids = (p: Page) => p.blocks.map((b) => b.id);
const dataOf = (p: Page, id: string) => p.blocks.find((b) => b.id === id)?.data as Record<string, unknown> | undefined;
const reorder = (p: Page, order: string[]): Page => ({
  ...p,
  blocks: order.map((id) => {
    const found = p.blocks.find((b) => b.id === id);
    if (!found) throw new Error(`no block ${id}`);
    return found;
  }),
});
const insert = (p: Page, index: number, b: Block): Page => ({
  ...p,
  blocks: [...p.blocks.slice(0, index), b, ...p.blocks.slice(index)],
});

const base = page([block('a'), block('b'), block('c')]);

// --- Equality helpers ---

describe('deepEqual / samePageContent', () => {
  it('compares JSON-like values structurally', () => {
    expect(deepEqual({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqual({ a: undefined }, {})).toBe(true);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('ignores block names and read-only fields, but not order', () => {
    const renamed = { ...base, status: 'published', blocks: base.blocks.map((b) => ({ ...b, name: 'Other' })) };
    expect(samePageContent(base, renamed)).toBe(true);
    expect(samePageContent(base, reorder(base, ['b', 'a', 'c']))).toBe(false);
  });
});

// --- Page fields ---

describe('mergePages: page fields', () => {
  it('takes the name changed on either side; local wins when both changed', () => {
    expect(mergePages(base, { ...base, name: 'Local' }, base).name).toBe('Local');
    expect(mergePages(base, base, { ...base, name: 'Remote' }).name).toBe('Remote');
    expect(mergePages(base, { ...base, name: 'Local' }, { ...base, name: 'Remote' }).name).toBe('Local');
  });

  it('merges each SEO field on its own', () => {
    const local = { ...base, seo: { ...base.seo, seoTitle: 'Local title', noindex: true } };
    const remote = { ...base, seo: { ...base.seo, seoDescription: 'Remote description', seoTitle: 'Remote title' } };

    const merged = mergePages(base, local, remote);

    expect(merged.seo).toEqual({
      ...defaultSeoFields, seoTitle: 'Local title', noindex: true, seoDescription: 'Remote description',
    });
  });

  it('merges design tokens per leaf, across and within groups', () => {
    const local = cloneDesignTokens(base.designTokens);
    local.colors.primary = '#111111';
    const remote = cloneDesignTokens(base.designTokens);
    remote.colors.secondary = '#222222';
    remote.typography.headingFont = 'Lora';
    remote.colors.primary = '#333333';

    const merged = mergePages(base, { ...base, designTokens: local }, { ...base, designTokens: remote }).designTokens;

    expect(merged.colors.primary).toBe('#111111');
    expect(merged.colors.secondary).toBe('#222222');
    expect(merged.typography.headingFont).toBe('Lora');
    expect(merged.spacing).toEqual(base.designTokens.spacing);
  });

  it('takes read-only fields (status, slug, publication) from remote', () => {
    const remote = { ...base, status: 'published', slug: 'new-slug', publishedAt: '2026-10-09T10:00:00Z', hasUnpublishedChanges: false };
    const local = { ...base, status: 'draft', hasUnpublishedChanges: true };

    const merged = mergePages(base, local, remote);

    expect(merged).toMatchObject({ status: 'published', slug: 'new-slug', publishedAt: '2026-10-09T10:00:00Z', hasUnpublishedChanges: false });
  });
});

// --- Blocks ---

describe('mergePages: blocks', () => {
  it('keeps blocks added on each side', () => {
    const local = insert(base, 1, block('local'));
    const remote = insert(base, 3, block('remote'));

    expect(ids(mergePages(base, local, remote))).toEqual(['a', 'local', 'b', 'c', 'remote']);
  });

  it('deletes a block deleted on one side and unchanged on the other', () => {
    expect(ids(mergePages(base, without(base, 'b'), base))).toEqual(['a', 'c']);
    expect(ids(mergePages(base, base, without(base, 'b')))).toEqual(['a', 'c']);
    expect(ids(mergePages(base, without(base, 'b'), without(base, 'b')))).toEqual(['a', 'c']);
  });

  it('never loses an edit to a delete: deleted locally, edited remotely', () => {
    const remote = edit(base, 'b', { title: 'Remote edit' });

    const merged = mergePages(base, without(base, 'b'), remote);

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
    expect(dataOf(merged, 'b')?.title).toBe('Remote edit');
  });

  it('never loses an edit to a delete: edited locally, deleted remotely', () => {
    const local = edit(base, 'b', { title: 'Local edit' }, { paddingTop: 8 });

    const merged = mergePages(base, local, without(base, 'b'));

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
    expect(dataOf(merged, 'b')?.title).toBe('Local edit');
    expect(merged.blocks[1].styles.paddingTop).toBe(8);
  });

  it('a block only moved on one side and deleted on the other is deleted (moving is not editing)', () => {
    const local = reorder(base, ['b', 'a', 'c']);

    expect(ids(mergePages(base, local, without(base, 'b')))).toEqual(['a', 'c']);
  });

  it('merges a block edited on both sides key by key', () => {
    const local = edit(base, 'b', { title: 'Local title' });
    const remote = edit(base, 'b', { subtitle: 'Remote subtitle' });

    expect(dataOf(mergePages(base, local, remote), 'b')).toMatchObject({ title: 'Local title', subtitle: 'Remote subtitle' });
  });

  it('local wins when both sides changed the same key', () => {
    const local = edit(base, 'b', { title: 'Local' });
    const remote = edit(base, 'b', { title: 'Remote' });

    expect(dataOf(mergePages(base, local, remote), 'b')?.title).toBe('Local');
  });

  it('merges styles key by key', () => {
    const local = edit(base, 'a', {}, { paddingTop: 16 });
    const remote = edit(base, 'a', { title: 'Remote' }, { bgColor: '#ff0000', paddingTop: 4 });

    const merged = mergePages(base, local, remote).blocks[0];

    expect(merged.styles).toMatchObject({ paddingTop: 16, bgColor: '#ff0000' });
    expect((merged.data as unknown as Record<string, unknown>).title).toBe('Remote');
  });

  it('treats a list as one value: the side that changed it wins whole', () => {
    const features = block('f', 'features', {
      features: [{ title: 'One', description: '' }, { title: 'Two', description: '' }],
    });
    const b = page([features]);
    const local = edit(b, 'f', { features: [{ title: 'One (edited)', description: '' }, { title: 'Two', description: '' }] });
    const remote = edit(b, 'f', {
      title: 'Remote heading',
      features: [{ title: 'One', description: '' }, { title: 'Two', description: '' }, { title: 'Three', description: '' }],
    });

    const merged = dataOf(mergePages(b, local, remote), 'f');

    expect(merged?.features).toEqual([{ title: 'One (edited)', description: '' }, { title: 'Two', description: '' }]);
    expect(merged?.title).toBe('Remote heading');
  });

  it('takes the remote list when only remote changed it', () => {
    const faq = block('q', 'faq', { questions: [{ question: 'Q1', answer: '' }] });
    const b = page([faq]);
    const remote = edit(b, 'q', { questions: [] });
    const local = edit(b, 'q', { title: 'Local' });

    expect(dataOf(mergePages(b, local, remote), 'q')).toEqual({ title: 'Local', questions: [] });
  });

  it('treats per-device styles as one value', () => {
    const local = { ...base, blocks: base.blocks.map((x) => (x.id === 'a' ? { ...x, responsiveStyles: { mobile: { paddingTop: 2 } } } : x)) };
    const remote = edit(base, 'a', { title: 'Remote' });

    const merged = mergePages(base, local, remote).blocks[0];

    expect(merged.responsiveStyles).toEqual({ mobile: { paddingTop: 2 } });
    expect((merged.data as unknown as Record<string, unknown>).title).toBe('Remote');
  });

  it('a type change (AI edit) on one side wins over data edits of the old type', () => {
    const aiBlock = makeBlock({ id: 'b', name: 'FAQ', styles: { ...defaultBlockStyles } }, 'faq', { title: 'AI FAQ', questions: [] });
    const local = { ...base, blocks: base.blocks.map((x) => (x.id === 'b' ? aiBlock : x)) };
    const remote = edit(base, 'b', { subtitle: 'Remote subtitle' });

    expect(mergePages(base, local, remote).blocks[1]).toEqual(aiBlock);
    expect(mergePages(base, remote, local).blocks[1]).toEqual(aiBlock);
  });

  it('merged data is valid for the block type', () => {
    const local = edit(base, 'a', { title: 'L' });
    const remote = edit(base, 'a', { subtitle: 'R' });

    expect(Object.keys(dataOf(mergePages(base, local, remote), 'a') ?? {}).sort())
      .toEqual(['buttonLink', 'buttonText', 'subtitle', 'title']);
  });

  it('mergeBlock returns the side that changed when only one did', () => {
    const [a] = base.blocks;
    const changed = edit(base, 'a', { title: 'X' }).blocks[0];
    expect(mergeBlock(a, changed, a)).toBe(changed);
    expect(mergeBlock(a, a, changed)).toBe(changed);
  });

  it('a block added with the same id on both sides keeps the local one', () => {
    const local = insert(base, 0, block('n', 'cta', { title: 'Local new' }));
    const remote = insert(base, 0, block('n', 'cta', { title: 'Remote new' }));

    const merged = mergePages(base, local, remote);

    expect(ids(merged)).toEqual(['n', 'a', 'b', 'c']);
    expect(dataOf(merged, 'n')?.title).toBe('Local new');
  });
});

// --- Order ---

describe('mergePages: order', () => {
  it('keeps the remote order when the local one did not change', () => {
    const remote = reorder(base, ['c', 'a', 'b']);
    expect(ids(mergePages(base, edit(base, 'a', { title: 'L' }), remote))).toEqual(['c', 'a', 'b']);
  });

  it('keeps the local order when it changed (even if remote also reordered)', () => {
    const local = reorder(base, ['b', 'a', 'c']);
    const remote = reorder(base, ['c', 'b', 'a']);
    expect(ids(mergePages(base, local, remote))).toEqual(['b', 'a', 'c']);
  });

  it('places a remote addition after its remote neighbour in the local order', () => {
    const local = reorder(base, ['c', 'b', 'a']);
    const remote = insert(base, 2, block('r')); // a, b, r, c

    expect(ids(mergePages(base, local, remote))).toEqual(['c', 'b', 'r', 'a']);
  });

  it('places a local addition after its local neighbour in the remote order', () => {
    const local = insert(base, 1, block('l')); // a, l, b, c
    const remote = reorder(base, ['b', 'c', 'a']);

    expect(ids(mergePages(base, local, remote))).toEqual(['b', 'c', 'a', 'l']);
  });

  it('puts an addition with no previous neighbour first, and keeps consecutive additions together', () => {
    const local = insert(insert(base, 0, block('l1')), 1, block('l2')); // l1, l2, a, b, c
    const remote = insert(base, 3, block('r'));

    expect(ids(mergePages(base, local, remote))).toEqual(['l1', 'l2', 'a', 'b', 'c', 'r']);
  });

  it('skips a neighbour deleted on the other side', () => {
    const local = insert(base, 2, block('l')); // a, b, l, c
    const remote = without(base, 'b');

    expect(ids(mergePages(base, local, remote))).toEqual(['a', 'l', 'c']);
  });

  it('a block kept because it was edited stays near its neighbour', () => {
    const local = edit(base, 'b', { title: 'Edited' });
    const remote = reorder(without(base, 'b'), ['c', 'a']);

    expect(ids(mergePages(base, local, remote))).toEqual(['c', 'a', 'b']);
  });
});

// --- Properties ---

/** Small deterministic PRNG (mulberry32) so failures can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES: BlockType[] = ['hero', 'cta', 'features', 'faq'];

function randomBlock(random: () => number, id: string): Block {
  const type = TYPES[Math.floor(random() * TYPES.length)];
  return block(id, type, { title: `t${Math.floor(random() * 3)}` }, { paddingTop: Math.floor(random() * 3) * 4 });
}

let nextId = 0;
function randomPage(random: () => number): Page {
  const count = Math.floor(random() * 6);
  return page(Array.from({ length: count }, () => randomBlock(random, `blk${nextId++}`)));
}

/** A copy of `p` with a few random edits, of every kind the editor makes. */
function mutate(p: Page, random: () => number): Page {
  let result = p;
  const steps = Math.floor(random() * 5);
  for (let i = 0; i < steps; i++) {
    const op = Math.floor(random() * 9);
    const target = result.blocks[Math.floor(random() * result.blocks.length)];
    switch (op) {
      case 0:
        if (target) result = edit(result, target.id, { title: `edit${Math.floor(random() * 4)}` });
        break;
      case 1:
        if (target) result = edit(result, target.id, {}, { bgColor: `#00000${Math.floor(random() * 4)}` });
        break;
      case 2:
        if (target) result = without(result, target.id);
        break;
      case 3:
        result = insert(result, Math.floor(random() * (result.blocks.length + 1)), randomBlock(random, `blk${nextId++}`));
        break;
      case 4: {
        if (result.blocks.length < 2) break;
        const order = ids(result);
        const [moved] = order.splice(Math.floor(random() * order.length), 1);
        order.splice(Math.floor(random() * (order.length + 1)), 0, moved);
        result = reorder(result, order);
        break;
      }
      case 5:
        result = { ...result, name: `name${Math.floor(random() * 3)}` };
        break;
      case 6:
        result = { ...result, seo: { ...result.seo, seoTitle: `seo${Math.floor(random() * 3)}` } };
        break;
      case 7: {
        const tokens = cloneDesignTokens(result.designTokens);
        tokens.colors.primary = `#12345${Math.floor(random() * 4)}`;
        result = { ...result, designTokens: tokens };
        break;
      }
      case 8:
        if (target && target.type === 'faq') {
          result = edit(result, target.id, { questions: [{ question: `q${Math.floor(random() * 3)}`, answer: '' }] });
        }
        break;
    }
  }
  return result;
}

const RUNS = 300;

describe('mergePages: properties', () => {
  it('merge(base, base, remote) is remote', () => {
    const random = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const b = randomPage(random);
      const remote = mutate(b, random);
      expect(samePageContent(mergePages(b, b, remote), remote)).toBe(true);
    }
  });

  it('merge(base, local, base) is local', () => {
    const random = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const b = randomPage(random);
      const local = mutate(b, random);
      expect(samePageContent(mergePages(b, local, b), local)).toBe(true);
    }
  });

  it('merge(base, x, x) is x', () => {
    const random = rng(3);
    for (let i = 0; i < RUNS; i++) {
      const b = randomPage(random);
      const x = mutate(b, random);
      expect(samePageContent(mergePages(b, x, x), x)).toBe(true);
    }
  });

  it('never loses a local or remote edit, and never duplicates a block', () => {
    const random = rng(4);
    for (let i = 0; i < RUNS; i++) {
      const b = randomPage(random);
      const local = mutate(b, random);
      const remote = mutate(b, random);
      const merged = mergePages(b, local, remote);
      const mergedIds = ids(merged);

      expect(new Set(mergedIds).size).toBe(mergedIds.length);
      const baseById = new Map(b.blocks.map((x) => [x.id, x]));
      for (const side of [local, remote]) {
        for (const x of side.blocks) {
          const original = baseById.get(x.id);
          const editedOrNew = !original || !deepEqual(original.data, x.data) || !deepEqual(original.styles, x.styles);
          if (editedOrNew) expect(mergedIds).toContain(x.id);
        }
      }
      // Every merged block comes from one of the three pages or merges them
      for (const id of mergedIds) {
        expect(ids(local).includes(id) || ids(remote).includes(id)).toBe(true);
      }
    }
  });

  it('local changes survive a merge: merging the result again with the same remote changes nothing', () => {
    const random = rng(5);
    for (let i = 0; i < RUNS; i++) {
      const b = randomPage(random);
      const local = mutate(b, random);
      const remote = mutate(b, random);
      const merged = mergePages(b, local, remote);
      // After the merge the base is remote: merging again is stable
      expect(samePageContent(mergePages(remote, merged, remote), merged)).toBe(true);
    }
  });
});

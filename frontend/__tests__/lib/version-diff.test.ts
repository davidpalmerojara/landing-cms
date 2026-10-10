import { describe, expect, it } from 'vitest';
import { normalizeBlockData } from '@/lib/block-data';
import { defaultBlockStyles } from '@/types/blocks';
import { computeVersionDiff } from '@/lib/version-diff';

const block = (id: string, type: string, title = type) => ({ id, type, data: { title }, styles: {} });

const statuses = (diff: { block: { id?: string }; status: string }[]) =>
  Object.fromEntries(diff.map((d) => [d.block.id, d.status]));

describe('version compare (QA-075)', () => {
  it('a reorder marks the moved block only: nothing removed, nothing new', () => {
    const saved = [block('h', 'hero'), block('f', 'features'), block('c', 'cta')];
    const current = [block('c', 'cta'), block('h', 'hero'), block('f', 'features')];

    const { currentDiff, versionDiff } = computeVersionDiff(current, saved);

    expect(statuses(currentDiff)).toEqual({ c: 'moved', h: 'unchanged', f: 'unchanged' });
    expect(statuses(versionDiff)).toEqual({ h: 'unchanged', f: 'unchanged', c: 'moved' });
  });

  it('tells added, removed and modified blocks apart by id', () => {
    const saved = [block('h', 'hero'), block('f', 'features')];
    const current = [block('h', 'hero', 'Otro título'), block('n', 'cta')];

    const { currentDiff, versionDiff } = computeVersionDiff(current, saved);

    expect(statuses(currentDiff)).toEqual({ h: 'modified', n: 'added' });
    expect(statuses(versionDiff)).toEqual({ h: 'modified', f: 'removed' });
  });

  it('an insert above does not mark the blocks below as moved', () => {
    const saved = [block('h', 'hero'), block('f', 'features')];
    const current = [block('n', 'cta'), block('h', 'hero'), block('f', 'features')];
    expect(statuses(computeVersionDiff(current, saved).currentDiff)).toEqual({ n: 'added', h: 'unchanged', f: 'unchanged' });
  });

  it('falls back to type and position for snapshots without ids', () => {
    const saved = [{ type: 'hero', data: {}, styles: {} }];
    const current = [{ type: 'hero', data: {}, styles: {} }, { type: 'cta', data: {}, styles: {} }];
    const { currentDiff } = computeVersionDiff(current, saved);
    expect(currentDiff.map((d) => d.status)).toEqual(['unchanged', 'added']);
  });
});

describe('blocks stored without their optional fields (EDITOR2-012)', () => {
  it('a reorder marks only the moved block, though the editor filled in the missing fields', () => {
    // As the API stores a page created without every field
    const saved = [
      { id: 'h', type: 'hero', data: { title: 'Hola' }, styles: {} },
      { id: 'c', type: 'cta', data: { title: 'Ya' }, styles: { paddingTop: 'lg' } },
    ];
    // As the editor holds it: normalized data, default styles in full
    const current = [
      { id: 'c', type: 'cta', data: normalizeBlockData('cta', { title: 'Ya' }), styles: { ...defaultBlockStyles, paddingTop: 'lg' } },
      { id: 'h', type: 'hero', data: normalizeBlockData('hero', { title: 'Hola' }), styles: { ...defaultBlockStyles } },
    ];
    const { currentDiff } = computeVersionDiff(current, saved);
    expect(currentDiff.map((d) => d.status).sort()).toEqual(['moved', 'unchanged']);
  });

  it('a real change is still a change', () => {
    const saved = [{ id: 'h', type: 'hero', data: { title: 'Hola' }, styles: {} }];
    const current = [{ id: 'h', type: 'hero', data: normalizeBlockData('hero', { title: 'Adiós' }), styles: { ...defaultBlockStyles } }];
    expect(computeVersionDiff(current, saved).currentDiff[0].status).toBe('modified');
  });
});


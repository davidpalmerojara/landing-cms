import { describe, expect, it } from 'vitest';
import { blockStyleClass, blockStylesCss } from '@/lib/block-styles-css';
import { defaultBlockStyles, type Block } from '@/types/blocks';

const id = '3f2a9c1e-0000-4000-8000-000000000001';

function block(styles: Partial<Block['styles']>, responsiveStyles?: Block['responsiveStyles']): Block {
  return {
    id,
    type: 'hero',
    name: 'Hero',
    data: {},
    styles: { ...defaultBlockStyles, ...styles },
    responsiveStyles,
  };
}

describe('blockStylesCss', () => {
  it('writes the desktop values as the base rule', () => {
    const css = blockStylesCss([block({ paddingTop: 64, bgColor: '#0F172A', borderRadius: 12 })]);

    expect(css).toBe(`.paxl-b-${id}{padding-top:64px;border-radius:12px;background-color:#0F172A;--theme-bg:#0F172A}`);
  });

  it('writes nothing for blocks without styles, like the editor', () => {
    expect(blockStylesCss([block({})])).toBe('');
  });

  it('overrides only what a device changes, inside its container query', () => {
    const css = blockStylesCss([block(
      { paddingTop: 96, paddingBottom: 96 },
      { tablet: { paddingTop: 64 }, mobile: { paddingTop: 32, paddingBottom: 48 } },
    )]);

    expect(css).toContain(`@container (min-width: 640px) and (max-width: 1023.98px){.paxl-b-${id}{padding-top:64px}}`);
    expect(css).toContain(`@container (max-width: 639.98px){.paxl-b-${id}{padding-top:32px;padding-bottom:48px}}`);
  });

  it('mobile builds on desktop, not on tablet, as resolveStyles does', () => {
    const css = blockStylesCss([block({ paddingTop: 96 }, { tablet: { paddingTop: 64 }, mobile: {} })]);

    expect(css).not.toContain('@container (max-width: 639.98px)');
  });

  it('a device that clears a value resets it, and the background goes back to the page theme', () => {
    const css = blockStylesCss([block({ paddingTop: 80, bgColor: '#111111' }, { mobile: { paddingTop: 0, bgColor: '' } })]);

    expect(css).toContain(`@container (max-width: 639.98px){.paxl-b-${id}{padding-top:0;background-color:transparent;--theme-bg:inherit}}`);
  });

  it('drops values that are not plain numbers or colours', () => {
    const hostile = block({
      bgColor: 'red;}</style><script>alert(1)</script>',
      paddingTop: '10px;}body{display:none' as unknown as number,
      paddingBottom: Number.POSITIVE_INFINITY,
      marginTop: 99999,
    });

    expect(blockStylesCss([hostile])).toBe('');
  });

  it('accepts the colour syntaxes the colour picker produces', () => {
    for (const color of ['#fff', '#0F172A80', 'rgb(15, 23, 42)', 'rgba(15,23,42,0.5)', 'hsl(220 40% 10%)', 'transparent']) {
      expect(blockStylesCss([block({ bgColor: color })])).toContain(`background-color:${color}`);
    }
  });

  it('skips blocks whose id could break the selector', () => {
    const bad = { ...block({ paddingTop: 10 }), id: 'x{}</style>' };

    expect(blockStyleClass(bad.id)).toBeNull();
    expect(blockStylesCss([bad])).toBe('');
  });
});

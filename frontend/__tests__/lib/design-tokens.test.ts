import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  tokensToCssVars,
  tokensToThemeVars,
  tokensToApi,
  apiToTokens,
  contrastRatio,
  meetsWcagAA,
  defaultDesignTokens,
  defaultColorTokens,
  defaultTypographyTokens,
  defaultSpacingTokens,
  defaultBorderTokens,
  fontStack,
  fontVariable,
  googleFonts,
  scaleRatios,
  type DesignTokens,
} from '@/lib/design-tokens';

describe('design-tokens', () => {
  // --- tokensToCssVars ---
  describe('tokensToCssVars', () => {
    const vars = tokensToCssVars(defaultDesignTokens);

    it('generates --bp-font-heading from the self-hosted font, with the name and sans-serif as fallbacks', () => {
      expect(vars['--bp-font-heading']).toBe("var(--font-page-inter, 'Inter'), sans-serif");
    });

    it('generates --bp-font-size-base in px', () => {
      expect(vars['--bp-font-size-base']).toBe('16px');
    });

    it('generates scaled font sizes based on scaleRatio', () => {
      const base = 16;
      const r = 1.25;
      expect(vars['--bp-font-size-lg']).toBe(`${Math.round(base * r)}px`);
      expect(vars['--bp-font-size-xl']).toBe(`${Math.round(base * r * r)}px`);
    });

    it('generates spacing vars', () => {
      expect(vars['--bp-spacing-section-y']).toBe('80px');
      expect(vars['--bp-max-content-width']).toBe('1200px');
    });

    it('generates border radius vars', () => {
      expect(vars['--bp-radius-sm']).toBe('4px');
      expect(vars['--bp-radius-full']).toBe('9999px');
    });

    it('leaves colors to --theme-* (--bp-color-* belongs to the editor chrome)', () => {
      const colorKeys = Object.keys(vars).filter((k) => k.startsWith('--bp-color-'));
      expect(colorKeys).toEqual([]);
    });
  });

  // --- tokensToThemeVars ---
  describe('tokensToThemeVars', () => {
    const vars = tokensToThemeVars(defaultDesignTokens);

    it('generates --theme-primary from tokens.colors.primary', () => {
      expect(vars['--theme-primary']).toBe(defaultColorTokens.primary);
    });

    it('maps --theme-bg to background color', () => {
      expect(vars['--theme-bg']).toBe(defaultColorTokens.background);
    });

    it('maps --theme-text to textPrimary', () => {
      expect(vars['--theme-text']).toBe(defaultColorTokens.textPrimary);
    });

    it('generates 8 theme vars total', () => {
      expect(Object.keys(vars)).toHaveLength(8);
    });
  });

  // --- tokensToApi / apiToTokens round-trip ---
  describe('tokensToApi / apiToTokens round-trip', () => {
    it('round-trips default tokens through API format', () => {
      const apiFormat = tokensToApi(defaultDesignTokens);
      const roundTripped = apiToTokens(apiFormat as Record<string, unknown>);
      expect(roundTripped).toEqual(defaultDesignTokens);
    });

    it('converts camelCase to snake_case in API format', () => {
      const apiFormat = tokensToApi(defaultDesignTokens) as Record<string, Record<string, unknown>>;
      expect(apiFormat.colors.text_primary).toBe(defaultColorTokens.textPrimary);
      expect(apiFormat.typography.heading_font).toBe(defaultTypographyTokens.headingFont);
    });
  });

  // --- apiToTokens edge cases ---
  describe('apiToTokens', () => {
    it('returns the defaults for null input', () => {
      expect(apiToTokens(null)).toEqual(defaultDesignTokens);
    });

    it('returns the defaults for undefined input', () => {
      expect(apiToTokens(undefined)).toEqual(defaultDesignTokens);
    });

    it('returns the defaults for an empty object (a page that saved no tokens)', () => {
      expect(apiToTokens({})).toEqual(defaultDesignTokens);
    });

    it('uses defaults when sections are missing', () => {
      const result = apiToTokens({ colors: { primary: '#ff0000' } });
      expect(result).toBeDefined();
      expect(result!.colors.primary).toBe('#ff0000');
      // Missing fields should get defaults
      expect(result!.typography).toEqual(defaultTypographyTokens);
      expect(result!.spacing).toEqual(defaultSpacingTokens);
      expect(result!.borders).toEqual(defaultBorderTokens);
    });
  });

  // --- contrastRatio ---
  describe('contrastRatio', () => {
    it('returns ~21 for black on white', () => {
      const ratio = contrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns 1 for same color', () => {
      expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
    });
  });

  // --- meetsWcagAA ---
  describe('meetsWcagAA', () => {
    it('passes for black on white', () => {
      expect(meetsWcagAA('#000000', '#ffffff')).toBe(true);
    });

    it('fails for similar colors', () => {
      expect(meetsWcagAA('#cccccc', '#dddddd')).toBe(false);
    });
  });

  // --- defaultDesignTokens ---
  describe('defaultDesignTokens', () => {
    it('has all required top-level fields', () => {
      expect(defaultDesignTokens).toHaveProperty('colors');
      expect(defaultDesignTokens).toHaveProperty('typography');
      expect(defaultDesignTokens).toHaveProperty('spacing');
      expect(defaultDesignTokens).toHaveProperty('borders');
    });

    it('colors has all 11 fields', () => {
      expect(Object.keys(defaultDesignTokens.colors)).toHaveLength(11);
    });

    it('typography has 8 fields', () => {
      expect(Object.keys(defaultDesignTokens.typography)).toHaveLength(8);
    });
  });
});

describe('theme fonts', () => {
  it('every font the theme offers is self-hosted under the variable fontStack() uses', () => {
    // lib/page-fonts.ts uses next/font, which only runs inside Next: read it as text
    const source = readFileSync(resolve(__dirname, '../../lib/page-fonts.ts'), 'utf8');
    const defined = [...source.matchAll(/variable: '(--font-page-[a-z0-9-]+)'/g)].map((m) => m[1]);

    expect(defined.sort()).toEqual(googleFonts.map(fontVariable).sort());
  });

  it('uses the self-hosted copy with the font name and a generic family as fallbacks', () => {
    expect(fontStack('Plus Jakarta Sans')).toBe("var(--font-page-plus-jakarta-sans, 'Plus Jakarta Sans'), sans-serif");
    expect(fontStack('Playfair Display')).toBe("var(--font-page-playfair-display, 'Playfair Display'), serif");
  });

  it('keeps unknown names as plain families and strips characters that could escape the value', () => {
    expect(fontStack("Comic Sans'; } body { display:none")).toBe("'Comic Sans  body  display:none', sans-serif");
  });
});

describe('server-side validation (backend/pages/design_tokens.py)', () => {
  // The server keeps its own copy of the lists the editor offers: read it as
  // text so the two cannot drift apart unnoticed.
  const source = readFileSync(resolve(__dirname, '../../../backend/pages/design_tokens.py'), 'utf8');

  it('accepts exactly the fonts the editor offers', () => {
    const block = source.match(/ALLOWED_FONTS = \(([^)]*)\)/)![1];
    const serverFonts = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(serverFonts).toEqual(googleFonts);
  });

  it('accepts exactly the type scale ratios the editor offers', () => {
    const block = source.match(/ALLOWED_SCALE_RATIOS = \(([^)]*)\)/)![1];
    const serverRatios = block.split(',').map((n) => n.trim()).filter(Boolean).map(Number);

    expect(serverRatios).toEqual(scaleRatios.map((r) => r.value));
  });
});

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
  type DesignTokens,
} from '@/lib/design-tokens';

describe('design-tokens', () => {
  // --- tokensToCssVars ---
  describe('tokensToCssVars', () => {
    const vars = tokensToCssVars(defaultDesignTokens);

    it('generates --bp-color-primary from tokens.colors.primary', () => {
      expect(vars['--bp-color-primary']).toBe(defaultColorTokens.primary);
    });

    it('generates --bp-font-heading with quotes and sans-serif fallback', () => {
      expect(vars['--bp-font-heading']).toBe("'Inter', sans-serif");
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

    it('includes all 11 color properties', () => {
      const colorKeys = Object.keys(vars).filter((k) => k.startsWith('--bp-color-'));
      expect(colorKeys).toHaveLength(11);
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

    it('generates 9 theme vars total', () => {
      expect(Object.keys(vars)).toHaveLength(9);
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
    it('returns undefined for null input', () => {
      expect(apiToTokens(null)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(apiToTokens(undefined)).toBeUndefined();
    });

    it('returns undefined for empty object', () => {
      expect(apiToTokens({})).toBeUndefined();
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

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { pageThemeVars } from '@/lib/page-theme';
import {
  apiToTokens,
  contrastRatio,
  defaultDesignTokens,
  presetTokens,
  tokenPresets,
  tokensToApi,
} from '@/lib/design-tokens';

type Vars = Record<string, string>;

/**
 * The legacy themes (lib/themes.ts, removed) as the editor rendered them: the
 * --theme-* values a page showed for each theme_id. primaryHover is left out
 * on purpose: no block ever read --theme-primary-hover.
 */
const legacyThemes: Record<string, Record<string, string>> = {
  default: { primary: '#4f46e5', secondary: '#8b5cf6', background: '#ffffff', surface: '#f9fafb', text: '#18181b', textMuted: '#71717a', border: '#e4e4e7', accent: '#6366f1' },
  ocean: { primary: '#0891b2', secondary: '#06b6d4', background: '#ffffff', surface: '#f0fdfa', text: '#134e4a', textMuted: '#5eead4', border: '#ccfbf1', accent: '#14b8a6' },
  sunset: { primary: '#ea580c', secondary: '#f97316', background: '#fffbeb', surface: '#fef3c7', text: '#78350f', textMuted: '#92400e', border: '#fde68a', accent: '#f59e0b' },
  forest: { primary: '#16a34a', secondary: '#22c55e', background: '#ffffff', surface: '#f0fdf4', text: '#14532d', textMuted: '#166534', border: '#bbf7d0', accent: '#4ade80' },
  dark: { primary: '#818cf8', secondary: '#a78bfa', background: '#18181b', surface: '#27272a', text: '#fafafa', textMuted: '#a1a1aa', border: '#3f3f46', accent: '#c084fc' },
  slate: { primary: '#14b8a6', secondary: '#06b6d4', background: '#0f172a', surface: '#1e293b', text: '#f1f5f9', textMuted: '#94a3b8', border: '#334155', accent: '#2dd4bf' },
  ember: { primary: '#ea580c', secondary: '#f59e0b', background: '#0c0a09', surface: '#1c1917', text: '#fafaf9', textMuted: '#a8a29e', border: '#292524', accent: '#fb923c' },
  rose: { primary: '#e11d48', secondary: '#f43f5e', background: '#ffffff', surface: '#fff1f2', text: '#1c1917', textMuted: '#78716c', border: '#fecdd3', accent: '#fb7185' },
};

/**
 * Legacy themes whose muted text was below WCAG AA (1.5:1 and 4.4:1). The
 * presets, which seed new pages and templates, now use these readable colors.
 * Pages that already had such a theme keep the tokens they stored, so the
 * equivalence tests below expect the preset to match the frozen legacy theme
 * in every value except this one.
 */
const readableMutedText: Record<string, string> = { ocean: '#0f766e', rose: '#57534e' };

function expectedFromLegacy(id: string): Vars {
  const colors = legacyThemes[id];
  return legacyThemeVars(id in readableMutedText ? { ...colors, textMuted: readableMutedText[id] } : colors);
}

/** What the old pageThemeVars emitted for a legacy theme, minus the unused hover color. */
function legacyThemeVars(colors: Record<string, string>): Vars {
  return {
    '--theme-primary': colors.primary,
    '--theme-secondary': colors.secondary,
    '--theme-bg': colors.background,
    '--theme-surface': colors.surface,
    '--theme-text': colors.text,
    '--theme-text-muted': colors.textMuted,
    '--theme-border': colors.border,
    '--theme-accent': colors.accent,
  };
}

/** The --theme-* variables legacy themes had; derived ones (contrast, ADR-041) are tested in design-tokens. */
const LEGACY_THEME_VARS = ['--theme-primary', '--theme-secondary', '--theme-bg', '--theme-surface', '--theme-text', '--theme-text-muted', '--theme-border', '--theme-accent'];

function themeVarsOf(vars: Vars): Vars {
  return Object.fromEntries(Object.entries(vars).filter(([name]) => LEGACY_THEME_VARS.includes(name)));
}

describe('pageThemeVars', () => {
  describe('legacy theme equivalence', () => {
    it('has a preset for each of the 8 legacy theme ids', () => {
      for (const id of Object.keys(legacyThemes)) {
        expect(tokenPresets.map((p) => p.id)).toContain(id);
      }
    });

    it.each(Object.keys(legacyThemes))('theme "%s" renders the same through its preset tokens', (id) => {
      const vars = pageThemeVars(presetTokens(id)) as Vars;

      expect(themeVarsOf(vars)).toEqual(expectedFromLegacy(id));
    });

    it.each(Object.keys(readableMutedText))('theme "%s" differs from its legacy palette only in a muted text that now passes AA', (id) => {
      const { background, surface, textMuted } = legacyThemes[id];

      expect(contrastRatio(textMuted, surface)).toBeLessThan(4.5);
      expect(contrastRatio(readableMutedText[id], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(readableMutedText[id], surface)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(Object.keys(legacyThemes))('theme "%s" still renders the same after a save and reload (API format)', (id) => {
      const reloaded = apiToTokens(tokensToApi(presetTokens(id)));

      expect(themeVarsOf(pageThemeVars(reloaded) as Vars)).toEqual(expectedFromLegacy(id));
    });

    it('a custom theme renders the same through the tokens the data migration writes for it', () => {
      const custom = { primary: '#112233', secondary: '#334455', background: '#fafafa', surface: '#eeeeee', text: '#101010', textMuted: '#505050', border: '#dddddd', accent: '#abcdef' };
      // Output of legacy_theme_to_tokens('custom', custom_theme) in the
      // 0014 migration, in the API format apiToTokens reads
      const migrated = {
        colors: {
          primary: '#112233', secondary: '#334455', accent: '#abcdef', background: '#fafafa', surface: '#eeeeee',
          text_primary: '#101010', text_secondary: '#505050', text_on_primary: '#ffffff', border: '#dddddd',
          success: '#10b981', error: '#ef4444',
        },
        typography: {
          heading_font: 'Inter', body_font: 'Inter', base_size: 16, scale_ratio: 1.25, heading_weight: 700,
          body_weight: 400, line_height_heading: 1.2, line_height_body: 1.6,
        },
        spacing: { section_padding_y: '80px', section_padding_x: '24px', max_content_width: '1200px' },
        borders: { radius_sm: '4px', radius_md: '8px', radius_lg: '16px', radius_full: '9999px' },
      };

      const vars = pageThemeVars(apiToTokens(migrated)) as Vars;

      expect(themeVarsOf(vars)).toEqual(legacyThemeVars(custom));
    });

    it('keeps the typography, spacing and borders legacy pages had (the defaults)', () => {
      const legacy = pageThemeVars(defaultDesignTokens) as Vars;
      const converted = pageThemeVars(presetTokens('ember')) as Vars;

      const bp = (vars: Vars) => Object.fromEntries(Object.entries(vars).filter(([name]) => name.startsWith('--bp-')));
      expect(bp(converted)).toEqual(bp(legacy));
    });
  });

  describe('presets', () => {
    it('are unique by id and by colors', () => {
      const ids = tokenPresets.map((p) => p.id);
      const palettes = tokenPresets.map((p) => JSON.stringify(p.colors));

      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(palettes).size).toBe(palettes.length);
    });

    it.each(tokenPresets.map((p) => p.id))('"%s" has valid colors', (id) => {
      for (const value of Object.values(presetTokens(id).colors)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('the default tokens are the "default" preset', () => {
      expect(defaultDesignTokens).toEqual(presetTokens('default'));
    });

    it.each(Object.keys(legacyThemes))('"%s" picks the more readable of white and near-black on its primary', (id) => {
      const { primary, textOnPrimary } = presetTokens(id).colors;
      const onWhite = contrastRatio('#ffffff', primary);

      if (onWhite >= 4.5) {
        expect(textOnPrimary).toBe('#ffffff');
      } else {
        expect(textOnPrimary).toBe('#0f172a');
        expect(contrastRatio('#0f172a', primary)).toBeGreaterThan(onWhite);
      }
    });

    it('an unknown preset id falls back to the default colors', () => {
      expect(presetTokens('nope').colors).toEqual(defaultDesignTokens.colors);
    });
  });

  it('gives a page that saved no tokens (the API sends {}) the default theme', () => {
    const vars = pageThemeVars(apiToTokens({})) as Vars;

    expect(vars['--theme-bg']).toBe(defaultDesignTokens.colors.background);
    expect(vars['--bp-font-heading']).toBeDefined();
  });

  it('follows the page tokens', () => {
    const tokens = {
      ...defaultDesignTokens,
      colors: { ...defaultDesignTokens.colors, background: '#123456' },
    };

    expect((pageThemeVars(tokens) as Vars)['--theme-bg']).toBe('#123456');
  });

  it('does not emit --bp-color-*, the editor chrome palette (app/globals.css)', () => {
    const vars = pageThemeVars(presetTokens('dark')) as Vars;

    expect(Object.keys(vars).filter((name) => name.startsWith('--bp-color-'))).toEqual([]);
  });

  it('provides every --theme-* variable the blocks read', () => {
    const dir = resolve(__dirname, '../../components/blocks');
    const read = new Set<string>();
    for (const file of readdirSync(dir)) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      for (const match of source.matchAll(/var\((--theme-[a-z-]+)/g)) read.add(match[1]);
    }

    const provided = Object.keys(pageThemeVars(defaultDesignTokens));
    expect(read.size).toBeGreaterThan(0);
    for (const name of read) expect(provided).toContain(name);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEXT_CONTRAST, contrastRatio } from '@/lib/design-tokens';

/**
 * APP3-003: in the light theme, muted, error and primary text sat just under
 * 4.5:1 on the tinted panels (bg-red-500/10, bg-primary/10) of the settings
 * danger zone, the dashboard chips and the magic-link error.
 */
const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
const lightBlock = /\[data-theme="light"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

function lightToken(name: string): string {
  const match = new RegExp(`--bp-color-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(lightBlock);
  if (!match) throw new Error(`light token ${name} not found`);
  return match[1];
}

/** `tint` painted at `alpha` over `base`, as the browser composites bg-xxx/10 */
function over(tint: string, alpha: number, base: string): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round(channel(tint, at) * alpha + channel(base, at) * (1 - alpha)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

describe('APP3-003: light theme text on tinted panels', () => {
  const white = lightToken('surface');
  const elevated = lightToken('surface-elevated');
  const errorTint = over(lightToken('error'), 0.1, white);
  const errorTintFromRed500 = over('#EF4444', 0.1, white);
  const primaryTint = over(lightToken('primary'), 0.1, white);

  it.each([
    ['muted text on the danger-zone panel', lightToken('text-muted'), errorTintFromRed500],
    ['muted text on the error tint', lightToken('text-muted'), errorTint],
    ['muted text on white', lightToken('text-muted'), white],
    ['muted text on the elevated surface', lightToken('text-muted'), elevated],
    ['error text on the danger-zone panel', lightToken('error-text'), errorTintFromRed500],
    ['error text on the error tint', lightToken('error-text'), errorTint],
    ['error text on white', lightToken('error-text'), white],
    ['primary text on the primary chip', lightToken('primary-text'), primaryTint],
    ['primary text on white', lightToken('primary-text'), white],
  ])('%s is at least 4.5:1', (_what, text, background) => {
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});

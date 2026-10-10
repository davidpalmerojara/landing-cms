/**
 * Per-block spacing, background and radius as a stylesheet, so a page renders
 * with the right values for every device without JavaScript (server render).
 *
 * The editor resolves these styles in JS for the device it previews
 * (resolveStyles). A published page can't know the visitor's screen on the
 * server, so each block gets one rule per device, selected with container
 * queries at the same breakpoints as the blocks' @tablet: / @desktop: variants.
 *
 * Values come from user data and end up inside a <style> element, so only
 * numbers and plain colour syntax are let through.
 */
import { resolveStyles } from '@/types/blocks';
import type { Block, BlockStyles } from '@/types/blocks';

/**
 * A block's background override (styles.bgColor). Every block paints its
 * section with `var(--block-bg, <its theme color>)`, so the override shows on
 * all of them, including those on the surface, primary or inverse colors (QA-096).
 * The editor canvas and previews set the same variable inline.
 */
export const BLOCK_BG_VAR = '--block-bg';

/** Class that carries a block's rules; set on its wrapper. */
export function blockStyleClass(blockId: string): string | null {
  return /^[A-Za-z0-9_-]{1,64}$/.test(blockId) ? `paxl-b-${blockId}` : null;
}

// Mobile < 640px <= tablet < 1024px <= desktop, as in the editor
const tabletQuery = '(min-width: 640px) and (max-width: 1023.98px)';
const mobileQuery = '(max-width: 639.98px)';

const maxLengthPx = 4000;
const colorPattern = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-zA-Z]{3,30})$/;

const lengthProperties: [keyof BlockStyles, string, string][] = [
  ['paddingTop', 'padding-top', '0'],
  ['paddingBottom', 'padding-bottom', '0'],
  ['paddingLeft', 'padding-left', '0'],
  ['paddingRight', 'padding-right', '0'],
  ['marginTop', 'margin-top', '0'],
  ['marginBottom', 'margin-bottom', '0'],
  ['borderRadius', 'border-radius', '0'],
];

/** Value each property returns to when a device clears it */
const resetValues: Record<string, string> = {
  ...Object.fromEntries(lengthProperties.map(([, property, reset]) => [property, reset])),
  'background-color': 'transparent',
  // Without an override each block paints its own section color
  [BLOCK_BG_VAR]: 'initial',
};

function cssLength(value: unknown): string | null {
  // As in the editor, 0 means "not set"
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
  return Math.abs(value) <= maxLengthPx ? `${value}px` : null;
}

function cssColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  return colorPattern.test(color) ? color : null;
}

function declarationsFor(styles: BlockStyles): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [key, property] of lengthProperties) {
    const length = cssLength(styles[key]);
    if (length) declarations.set(property, length);
  }
  const background = cssColor(styles.bgColor);
  if (background) {
    declarations.set('background-color', background);
    declarations.set(BLOCK_BG_VAR, background);
  }
  return declarations;
}

/** What a device changes relative to desktop, including values it clears. */
function deviceOverrides(base: Map<string, string>, device: Map<string, string>): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const [property, value] of device) {
    if (base.get(property) !== value) overrides.set(property, value);
  }
  for (const property of base.keys()) {
    if (!device.has(property)) overrides.set(property, resetValues[property]);
  }
  return overrides;
}

function rule(selector: string, declarations: Map<string, string>): string {
  const body = [...declarations].map(([property, value]) => `${property}:${value}`).join(';');
  return `${selector}{${body}}`;
}

export function blockStylesCss(blocks: Block[]): string {
  const desktopRules: string[] = [];
  const tabletRules: string[] = [];
  const mobileRules: string[] = [];

  for (const block of blocks) {
    const className = blockStyleClass(block.id);
    if (!className) continue;
    const selector = `.${className}`;
    const desktop = declarationsFor(resolveStyles(block, 'desktop'));
    if (desktop.size) desktopRules.push(rule(selector, desktop));
    if (!block.responsiveStyles) continue;
    const tablet = deviceOverrides(desktop, declarationsFor(resolveStyles(block, 'tablet')));
    if (tablet.size) tabletRules.push(rule(selector, tablet));
    const mobile = deviceOverrides(desktop, declarationsFor(resolveStyles(block, 'mobile')));
    if (mobile.size) mobileRules.push(rule(selector, mobile));
  }

  return [
    ...desktopRules,
    tabletRules.length ? `@container ${tabletQuery}{${tabletRules.join('')}}` : '',
    mobileRules.length ? `@container ${mobileQuery}{${mobileRules.join('')}}` : '',
  ].join('');
}

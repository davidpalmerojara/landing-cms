'use client';

import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { resolveStyles } from '@/types/blocks';
import type { Block, BlockStyles } from '@/types/blocks';
import type { ColorTokens, DesignTokens } from '@/lib/design-tokens';
import MobileSelect from './MobileSelect';

/** Theme colors offered as a block background, in this order */
const THEME_COLOR_ROLES = ['background', 'surface', 'primary', 'secondary', 'accent', 'textPrimary'] as const satisfies readonly (keyof ColorTokens)[];

/** Spacing steps (px): the page's scale instead of a free slider */
export const SPACING_STEPS = [
  { key: 'none', px: 0 },
  { key: 's', px: 16 },
  { key: 'm', px: 32 },
  { key: 'l', px: 64 },
  { key: 'xl', px: 96 },
] as const;

type SpacingKey = 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight' | 'marginTop' | 'marginBottom';

const SPACING_GROUPS: { key: 'padding' | 'margin'; fields: SpacingKey[] }[] = [
  { key: 'padding', fields: ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'] },
  { key: 'margin', fields: ['marginTop', 'marginBottom'] },
];

export interface ThemeSwatch {
  role: (typeof THEME_COLOR_ROLES)[number];
  color: string;
}

/** The page's theme colors, each once (two roles can share a color) (QA-122). */
export function themeSwatches(tokens: DesignTokens): ThemeSwatch[] {
  const seen = new Set<string>();
  const swatches: ThemeSwatch[] = [];
  for (const role of THEME_COLOR_ROLES) {
    const color = tokens.colors[role];
    const key = color.trim().toLowerCase();
    if (!color || seen.has(key)) continue;
    seen.add(key);
    swatches.push({ role, color });
  }
  return swatches;
}

/** Corner radius steps from the theme's border tokens. */
function radiusSteps(tokens: DesignTokens): { key: 'none' | 'sm' | 'md' | 'lg'; px: number }[] {
  const px = (value: string) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const steps: { key: 'none' | 'sm' | 'md' | 'lg'; px: number }[] = [
    { key: 'none', px: 0 },
    { key: 'sm', px: px(tokens.borders.radiusSm) },
    { key: 'md', px: px(tokens.borders.radiusMd) },
    { key: 'lg', px: px(tokens.borders.radiusLg) },
  ];
  // A theme may give two steps the same size: offer it once
  return steps.filter((step, i) => steps.findIndex((other) => other.px === step.px) === i);
}

/**
 * A block's styles on a phone (QA-067, QA-122): the background comes from the
 * page's theme colors and spacing from a small scale, instead of free pixels
 * and hex codes ("el tema manda"). Values are still stored in px, so the
 * desktop inspector shows the same thing.
 */
export default function MobileBlockStyles({ block }: { block: Block }) {
  const t = useTranslations();
  const tokens = useEditorStore((s) => s.page.designTokens);
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const styles = resolveStyles(block, 'desktop');
  const set = (key: keyof BlockStyles, value: unknown) => updateBlockStyle(block.id, key, value);

  return (
    <div className="space-y-6 px-5 pb-5">
      <BackgroundPicker
        value={styles.bgColor}
        swatches={themeSwatches(tokens)}
        onChange={(value) => set('bgColor', value)}
      />

      {SPACING_GROUPS.map((group) => (
        <fieldset key={group.key} className="space-y-2">
          <legend className="text-xs font-semibold text-secondary mb-2">{t(`mobile.styles.${group.key}`)}</legend>
          <div className="grid grid-cols-2 gap-3">
            {group.fields.map((field) => (
              <StepSelect
                key={field}
                label={t(`mobile.styles.${field}`)}
                value={styles[field]}
                steps={SPACING_STEPS.map((step) => ({ value: step.px, label: t(`mobile.styles.step.${step.key}`, { px: step.px }) }))}
                onChange={(value) => set(field, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <StepSelect
        label={t('mobile.styles.borderRadius')}
        value={styles.borderRadius}
        steps={radiusSteps(tokens).map((step) => ({ value: step.px, label: t(`mobile.styles.radius.${step.key}`, { px: step.px }) }))}
        onChange={(value) => set('borderRadius', value)}
      />
    </div>
  );
}

function StepSelect({
  label,
  value,
  steps,
  onChange,
}: {
  label: string;
  value: number;
  steps: { value: number; label: string }[];
  onChange: (value: number) => void;
}) {
  const t = useTranslations();
  const id = useId();
  const current = Number.isFinite(value) ? value : 0;
  const isCustom = !steps.some((step) => step.value === current);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs text-secondary">{label}</label>
      <MobileSelect
        id={id}
        value={String(current)}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      >
        {/* A value set on a computer that is not on the scale stays as it is until changed */}
        {isCustom && <option value={String(current)}>{t('mobile.styles.custom', { px: current })}</option>}
        {steps.map((step) => (
          <option key={step.value} value={String(step.value)}>{step.label}</option>
        ))}
      </MobileSelect>
    </div>
  );
}

function BackgroundPicker({
  value,
  swatches,
  onChange,
}: {
  value: string;
  swatches: ThemeSwatch[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations();
  const labelId = useId();
  const hexId = useId();
  const [showCustom, setShowCustom] = useState(false);
  const current = value.trim().toLowerCase();
  const isThemeColor = current === '' || swatches.some((s) => s.color.toLowerCase() === current);

  return (
    <div className="space-y-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="block text-xs font-semibold text-secondary">{t('mobile.styles.background')}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          aria-pressed={current === ''}
          className={`min-h-11 px-3 rounded-xl border-2 text-[13px] font-medium text-primary flex items-center gap-1.5 ${
            current === '' ? 'border-primary' : 'border-default/30'
          }`}
        >
          {current === '' && <Check size={14} aria-hidden="true" />}
          {t('mobile.styles.noBackground')}
        </button>
        {swatches.map((swatch) => {
          const selected = swatch.color.toLowerCase() === current;
          return (
            <button
              key={swatch.role}
              type="button"
              onClick={() => onChange(swatch.color)}
              aria-pressed={selected}
              aria-label={t('mobile.styles.themeColor', { role: t(`mobile.styles.roles.${swatch.role}`), value: swatch.color })}
              title={t(`mobile.styles.roles.${swatch.role}`)}
              className={`w-11 h-11 rounded-xl border-2 transition-transform active:scale-95 ${
                selected ? 'border-primary ring-2 ring-primary/30' : 'border-default/40'
              }`}
              style={{ backgroundColor: swatch.color }}
            />
          );
        })}
      </div>
      {showCustom || !isThemeColor ? (
        <div className="flex items-center gap-2">
          <label htmlFor={hexId} className="sr-only">{t('inspector.hexInput')}</label>
          <input
            id={hexId}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-h-11 px-3 py-2.5 rounded-xl bg-surface-card border border-default/15 text-primary text-base font-mono focus:border-primary/50 outline-none"
          />
          <div
            aria-hidden="true"
            className="w-11 h-11 rounded-xl border border-default/30 shrink-0"
            style={{ backgroundColor: value || 'transparent' }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="text-[13px] text-primary-color active:opacity-70 font-medium min-h-11 flex items-center"
        >
          {t('inspector.customizeColor')}
        </button>
      )}
    </div>
  );
}

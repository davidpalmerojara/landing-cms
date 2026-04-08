'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Palette, Type, Maximize2, Square,
  ChevronDown, ChevronRight, AlertTriangle, Check,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import {
  defaultDesignTokens, tokenPresets, scaleRatios, googleFonts,
  meetsWcagAA, contrastRatio,
} from '@/lib/design-tokens';
import type {
  ColorTokens, TypographyTokens, SpacingTokens, BorderTokens,
  TokenPreset,
} from '@/lib/design-tokens';

// --- Color Picker Field ---

function ColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 group">
      <label className="relative w-8 h-8 rounded-lg border border-default overflow-hidden cursor-pointer shrink-0 shadow-inner hover:border-default transition-colors">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="w-full h-full" style={{ backgroundColor: value }} />
      </label>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-primary font-medium">{label}</div>
        {description && <div className="text-[10px] text-muted truncate">{description}</div>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
        }}
        className="w-[72px] bg-surface-elevated border border-default rounded-md px-2 py-1 text-[11px] text-secondary font-mono text-center focus:outline-none focus:border-[#2563EB]"
      />
    </div>
  );
}

// --- Contrast Warning ---

function ContrastWarning({ textColor, bgColor }: { textColor: string; bgColor: string }) {
  const t = useTranslations('designTokens');
  if (textColor.length !== 7 || bgColor.length !== 7) return null;
  const passes = meetsWcagAA(textColor, bgColor);
  const ratio = contrastRatio(textColor, bgColor);
  if (passes) return null;
  return (
    <div className="flex items-center gap-1.5 text-amber-400 text-[10px] px-2 py-1 bg-amber-500/10 rounded-md mt-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      <span>{t('contrastWarning', { ratio: ratio.toFixed(1) })}</span>
    </div>
  );
}

// --- Collapsible Section ---

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-subtle\/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-secondary uppercase tracking-wider hover:bg-surface-card\/30 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-muted" />
        {title}
        <span className="ml-auto">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-muted" />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// --- Preset Palette Picker ---

function PalettePresets({ onSelect }: { onSelect: (preset: TokenPreset) => void }) {
  const t = useTranslations('designTokens');

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted uppercase tracking-wider font-medium">{t('presetPalettes')}</div>
      <div className="grid grid-cols-2 gap-2">
        {tokenPresets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelect(preset)}
            className="flex flex-col gap-1.5 p-2 rounded-lg border border-subtle hover:border-[#2563EB]/50 hover:bg-surface-card\/50 transition-all group"
          >
            <div className="flex gap-0.5">
              {[preset.colors.primary, preset.colors.secondary, preset.colors.accent, preset.colors.background, preset.colors.textPrimary].map((c, i) => (
                <div key={i} className="w-4 h-4 rounded-sm border border-default\/50" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span className="text-[10px] text-secondary group-hover:text-primary transition-colors">{preset.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Typography Scale Preview ---

function TypographyScalePreview({ baseSize, scaleRatio }: { baseSize: number; scaleRatio: number }) {
  const sizes = [
    { label: 'h1', size: Math.round(baseSize * scaleRatio ** 4) },
    { label: 'h2', size: Math.round(baseSize * scaleRatio ** 3) },
    { label: 'h3', size: Math.round(baseSize * scaleRatio ** 2) },
    { label: 'body', size: baseSize },
    { label: 'small', size: Math.round(baseSize / scaleRatio) },
  ];
  return (
    <div className="bg-surface-elevated\/50 rounded-lg p-3 space-y-1">
      {sizes.map(({ label, size }) => (
        <div key={label} className="flex items-baseline gap-2">
          <span className="text-[9px] text-muted w-8 text-right font-mono">{label}</span>
          <span className="text-secondary leading-tight truncate" style={{ fontSize: Math.min(size, 28) }}>
            Aa
          </span>
          <span className="text-[9px] text-muted font-mono ml-auto">{size}px</span>
        </div>
      ))}
    </div>
  );
}

// --- Slider Field ---

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-secondary">{label}</span>
        <span className="text-[10px] text-muted font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-surface-card rounded-full appearance-none cursor-pointer accent-[#2563EB] [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#2563EB] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
      />
    </div>
  );
}

// --- Select Field ---

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-elevated border border-default rounded-md px-2 py-1.5 text-xs text-secondary focus:outline-none focus:border-[#2563EB] appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// --- Main Panel ---

export default function DesignTokensPanel() {
  const t = useTranslations('designTokens');
  const page = useEditorStore((s) => s.page);
  const updateColor = useEditorStore((s) => s.updateDesignTokenColor);
  const updateTypography = useEditorStore((s) => s.updateDesignTokenTypography);
  const updateSpacing = useEditorStore((s) => s.updateDesignTokenSpacing);
  const updateBorders = useEditorStore((s) => s.updateDesignTokenBorders);
  const setDesignTokenColors = useEditorStore((s) => s.setDesignTokenColors);

  const tokens = page.designTokens || defaultDesignTokens;
  const colors = tokens.colors;
  const typo = tokens.typography;
  const spacing = tokens.spacing;
  const borders = tokens.borders;

  const handlePreset = useCallback((preset: TokenPreset) => {
    setDesignTokenColors(preset.colors);
  }, [setDesignTokenColors]);

  const parsePx = (v: string) => parseInt(v) || 0;

  const colorFields: { key: keyof ColorTokens; label: string; desc: string }[] = [
    { key: 'primary', label: t('colorPrimary'), desc: t('colorPrimaryDesc') },
    { key: 'secondary', label: t('colorSecondary'), desc: t('colorSecondaryDesc') },
    { key: 'accent', label: t('colorAccent'), desc: t('colorAccentDesc') },
    { key: 'background', label: t('colorBackground'), desc: t('colorBackgroundDesc') },
    { key: 'surface', label: t('colorSurface'), desc: t('colorSurfaceDesc') },
    { key: 'textPrimary', label: t('colorTextPrimary'), desc: t('colorTextPrimaryDesc') },
    { key: 'textSecondary', label: t('colorTextSecondary'), desc: t('colorTextSecondaryDesc') },
    { key: 'textOnPrimary', label: t('colorTextOnPrimary'), desc: t('colorTextOnPrimaryDesc') },
    { key: 'border', label: t('colorBorder'), desc: t('colorBorderDesc') },
    { key: 'success', label: t('colorSuccess'), desc: t('colorSuccessDesc') },
    { key: 'error', label: t('colorError'), desc: t('colorErrorDesc') },
  ];

  return (
    <aside className="w-64 lg:w-72 xl:w-80 bg-surface border-l border-surface-elevated\/80 flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b border-subtle\/50">
        <h2 className="text-sm font-semibold text-primary">{t('title')}</h2>
        <p className="text-[10px] text-muted mt-0.5">{t('description')}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Colors */}
        <Section title={t('colors')} icon={Palette}>
          <PalettePresets onSelect={handlePreset} />
          <div className="h-px bg-subtle\/60 my-2" />
          <div className="space-y-2.5">
            {colorFields.map(({ key, label, desc }) => (
              <ColorField
                key={key}
                label={label}
                description={desc}
                value={colors[key]}
                onChange={(v) => updateColor(key, v)}
              />
            ))}
          </div>
          {/* Contrast warnings */}
          <ContrastWarning textColor={colors.textPrimary} bgColor={colors.background} />
          <ContrastWarning textColor={colors.textOnPrimary} bgColor={colors.primary} />
        </Section>

        {/* Typography */}
        <Section title={t('typography')} icon={Type} defaultOpen={false}>
          <SelectField
            label={t('headingFont')}
            value={typo.headingFont}
            options={googleFonts.map((f) => ({ value: f, label: f }))}
            onChange={(v) => updateTypography('headingFont', v)}
          />
          <SelectField
            label={t('bodyFont')}
            value={typo.bodyFont}
            options={googleFonts.map((f) => ({ value: f, label: f }))}
            onChange={(v) => updateTypography('bodyFont', v)}
          />
          <SliderField
            label={t('baseSize')}
            value={typo.baseSize}
            min={14}
            max={20}
            step={1}
            unit="px"
            onChange={(v) => updateTypography('baseSize', v)}
          />
          <SelectField
            label={t('typeScale')}
            value={typo.scaleRatio}
            options={scaleRatios.map((s) => ({ value: s.value, label: s.label }))}
            onChange={(v) => updateTypography('scaleRatio', Number(v))}
          />
          <TypographyScalePreview baseSize={typo.baseSize} scaleRatio={typo.scaleRatio} />
          <SliderField
            label={t('headingWeight')}
            value={typo.headingWeight}
            min={400}
            max={900}
            step={100}
            onChange={(v) => updateTypography('headingWeight', v)}
          />
          <SliderField
            label={t('bodyWeight')}
            value={typo.bodyWeight}
            min={300}
            max={600}
            step={100}
            onChange={(v) => updateTypography('bodyWeight', v)}
          />
          <SliderField
            label={t('headingLineHeight')}
            value={typo.lineHeightHeading}
            min={1}
            max={2}
            step={0.1}
            onChange={(v) => updateTypography('lineHeightHeading', v)}
          />
          <SliderField
            label={t('bodyLineHeight')}
            value={typo.lineHeightBody}
            min={1.2}
            max={2}
            step={0.1}
            onChange={(v) => updateTypography('lineHeightBody', v)}
          />
        </Section>

        {/* Spacing */}
        <Section title={t('spacing')} icon={Maximize2} defaultOpen={false}>
          <SliderField
            label={t('sectionPaddingY')}
            value={parsePx(spacing.sectionPaddingY)}
            min={20}
            max={160}
            step={4}
            unit="px"
            onChange={(v) => updateSpacing('sectionPaddingY', `${v}px`)}
          />
          <SliderField
            label={t('sectionPaddingX')}
            value={parsePx(spacing.sectionPaddingX)}
            min={12}
            max={80}
            step={4}
            unit="px"
            onChange={(v) => updateSpacing('sectionPaddingX', `${v}px`)}
          />
          <SliderField
            label={t('maxContentWidth')}
            value={parsePx(spacing.maxContentWidth)}
            min={800}
            max={1600}
            step={50}
            unit="px"
            onChange={(v) => updateSpacing('maxContentWidth', `${v}px`)}
          />
        </Section>

        {/* Borders */}
        <Section title={t('borders')} icon={Square} defaultOpen={false}>
          <SliderField
            label={t('radiusSm')}
            value={parsePx(borders.radiusSm)}
            min={0}
            max={12}
            step={1}
            unit="px"
            onChange={(v) => updateBorders('radiusSm', `${v}px`)}
          />
          <SliderField
            label={t('radiusMd')}
            value={parsePx(borders.radiusMd)}
            min={0}
            max={24}
            step={1}
            unit="px"
            onChange={(v) => updateBorders('radiusMd', `${v}px`)}
          />
          <SliderField
            label={t('radiusLg')}
            value={parsePx(borders.radiusLg)}
            min={0}
            max={32}
            step={1}
            unit="px"
            onChange={(v) => updateBorders('radiusLg', `${v}px`)}
          />
          <div className="flex items-center gap-3 bg-surface-elevated\/50 rounded-lg p-3">
            <div className="w-10 h-10 border border-default" style={{ borderRadius: borders.radiusSm, backgroundColor: colors.surface }} />
            <div className="w-10 h-10 border border-default" style={{ borderRadius: borders.radiusMd, backgroundColor: colors.surface }} />
            <div className="w-10 h-10 border border-default" style={{ borderRadius: borders.radiusLg, backgroundColor: colors.surface }} />
            <div className="w-10 h-10 border border-default" style={{ borderRadius: borders.radiusFull, backgroundColor: colors.surface }} />
            <div className="flex flex-col text-[9px] text-muted font-mono">
              <span>{t('radiusPreview')}</span>
            </div>
          </div>
        </Section>
      </div>
    </aside>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { Pipette } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ColorFieldProps {
  /** Id of the button that opens the palette; the field label points at it. */
  id: string;
  /** Id of the field's visible label, used as the name of the button and the palette. */
  labelId?: string;
  /** '' when the field has no colour of its own (see `inheritedColor`) */
  value: string;
  onChange: (value: string) => void;
  /**
   * The colour shown while `value` is empty, e.g. what the theme paints
   * (QA-082). With it the field says "From the theme" instead of a made-up
   * white.
   */
  inheritedColor?: string | null;
}

/** One way to write a colour everywhere: #RRGGBB in capitals (QA-114). */
export function formatHex(color: string): string {
  return color.trim().toUpperCase();
}

// One hue per row and one shade per column: arrows never jump between hues mid-row (EDITOR2-011)
const SWATCH_COLUMNS = 8;

const PRESET_COLORS = [
  // Grays
  '#ffffff', '#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#3f3f46', '#18181b', '#000000',
  // Red
  '#fef2f2', '#fecaca', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
  // Orange
  '#fff7ed', '#fed7aa', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
  // Yellow
  '#fefce8', '#fef08a', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12',
  // Green
  '#f0fdf4', '#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d',
  // Teal
  '#f0fdfa', '#99f6e4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a',
  // Blue
  '#eff6ff', '#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
  // Indigo
  '#eef2ff', '#c7d2fe', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81',
  // Purple
  '#faf5ff', '#e9d5ff', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87',
  // Pink
  '#fdf2f8', '#fbcfe8', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843',
];

export default function ColorField({ id, labelId, value, onChange, inheritedColor }: ColorFieldProps) {
  const t = useTranslations('inspector');
  const isInherited = !value && inheritedColor !== undefined;
  // What the swatch shows and the palette starts from
  const shownColor = formatHex(value || inheritedColor || '#FFFFFF');
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(shownColor);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const popoverId = `${id}-palette`;
  // Roving tabindex: the palette is one Tab stop, arrows move between swatches
  const selectedSwatch = PRESET_COLORS.indexOf(value.toLowerCase());
  const tabStopSwatch = selectedSwatch >= 0 ? selectedSwatch : 0;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleHexSubmit = () => {
    const cleaned = hexInput.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      // Leaving the field untouched keeps an inherited colour inherited
      if (formatHex(cleaned) !== shownColor) onChange(formatHex(cleaned));
    } else if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      onChange(formatHex(`#${cleaned}`));
      setHexInput(formatHex(`#${cleaned}`));
    }
  };

  const handleToggleOpen = () => {
    if (!isOpen) {
      setHexInput(shownColor);
    }
    setIsOpen((open) => !open);
  };

  const closeAndReturnFocus = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSwatchKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -SWATCH_COLUMNS,
      ArrowDown: SWATCH_COLUMNS,
    };
    let next: number | undefined;
    if (e.key in step) next = Math.min(Math.max(index + step[e.key], 0), PRESET_COLORS.length - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = PRESET_COLORS.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    popoverRef.current?.querySelectorAll<HTMLButtonElement>('[data-swatch]')[next]?.focus();
  };

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) {
          e.stopPropagation();
          closeAndReturnFocus();
        }
      }}
      onBlur={(e) => {
        // Tabbing out of the field closes the palette; clicks are handled by the outside-click listener
        const next = e.relatedTarget;
        if (isOpen && next instanceof Node && !e.currentTarget.contains(next)) setIsOpen(false);
      }}
    >
      {/* Trigger */}
      <button
        type="button"
        id={id}
        ref={triggerRef}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        aria-labelledby={labelId ? `${labelId} ${id}` : undefined}
        className="w-full flex items-center gap-3 p-2 rounded-lg bg-surface-elevated border border-default/10 cursor-pointer hover:border-default transition-colors shadow-inner text-left"
        onClick={handleToggleOpen}
      >
        <div
          aria-hidden="true"
          className={`w-7 h-7 rounded-md border shadow-sm shrink-0 ${isInherited ? 'border-dashed border-default' : 'border-default'}`}
          style={{ backgroundColor: isInherited ? (inheritedColor ?? 'transparent') : shownColor }}
        />
        {isInherited ? (
          <span className="flex-1 min-w-0 flex items-baseline gap-2">
            <span className="text-[12px] text-secondary">{t('colorFromTheme')}</span>
            {inheritedColor && <span className="text-[11px] text-muted font-mono">{formatHex(inheritedColor)}</span>}
          </span>
        ) : (
          <span className="text-[12px] text-secondary font-mono flex-1">
            {shownColor}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="group"
          aria-labelledby={labelId}
          className="absolute z-50 top-full left-0 mt-2 w-66 max-w-[calc(100vw-32px)] bg-surface-card border border-default/20 rounded-xl shadow-2xl shadow-black/50 p-3 space-y-3"
        >
          {/* Swatches grid */}
          <div className="grid grid-cols-8 gap-1">
            {PRESET_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                data-swatch=""
                tabIndex={index === tabStopSwatch ? 0 : -1}
                aria-label={t('colorOption', { value: formatHex(color) })}
                aria-pressed={value.toLowerCase() === color}
                onKeyDown={(e) => handleSwatchKeyDown(e, index)}
                className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${
                  value.toLowerCase() === color
                    ? 'border-primary ring-1 ring-primary scale-110'
                    : 'border-default hover:border-default'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(formatHex(color));
                  setHexInput(formatHex(color));
                }}
                title={formatHex(color)}
              />
            ))}
          </div>

          {/* Hex input + native picker */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-surface-elevated border border-default/10 rounded-lg overflow-hidden">
              <span className="text-[11px] text-muted pl-2.5 font-mono">#</span>
              <input
                type="text"
                value={hexInput.replace('#', '')}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  setHexInput(`#${v}`);
                }}
                onBlur={handleHexSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleHexSubmit();
                }}
                aria-label={t('hexInput')}
                className="flex-1 bg-transparent text-[12px] text-primary font-mono py-1.5 px-1 outline-none uppercase"
                maxLength={6}
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              className="w-8 h-8 rounded-lg bg-surface-elevated border border-default/10 hover:border-default flex items-center justify-center transition-colors"
              onClick={() => nativeRef.current?.click()}
              aria-label={t('advancedPicker')}
              title={t('advancedPicker')}
            >
              <Pipette aria-hidden="true" className="w-3.5 h-3.5 text-secondary" />
            </button>
            <input
              ref={nativeRef}
              type="color"
              tabIndex={-1}
              aria-hidden="true"
              value={shownColor.toLowerCase()}
              onChange={(e) => {
                onChange(formatHex(e.target.value));
                setHexInput(formatHex(e.target.value));
              }}
              className="w-0 h-0 opacity-0 absolute"
            />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { Palette, ChevronLeft, Paintbrush } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { themes, defaultCustomThemeColors } from '@/lib/themes';
import type { ThemeColors } from '@/lib/themes';

export default function ThemeSelector() {
  const t = useTranslations('themeSelector');
  const themeId = useEditorStore((s) => s.page.themeId || 'default');
  const customTheme = useEditorStore((s) => s.page.customTheme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const setCustomThemeColor = useEditorStore((s) => s.setCustomThemeColor);
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const customColors = customTheme || defaultCustomThemeColors;
  const colorLabels: { key: keyof ThemeColors; label: string }[] = [
    { key: 'primary', label: t('primary') },
    { key: 'primaryHover', label: t('primaryHover') },
    { key: 'secondary', label: t('secondary') },
    { key: 'background', label: t('background') },
    { key: 'surface', label: t('surface') },
    { key: 'text', label: t('text') },
    { key: 'textMuted', label: t('textMuted') },
    { key: 'border', label: t('border') },
    { key: 'accent', label: t('accent') },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm font-medium text-secondary hover:text-primary flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-surface-card\/50 transition-colors"
        title={t('buttonTitle')}
      >
        <Palette className="w-4 h-4" />
        {t('button')}
      </button>

      {open && !showCustom && (
        <div className="absolute top-full right-0 mt-2 w-52 bg-surface-card border border-default\/15 rounded-lg shadow-xl z-50 py-2">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted font-semibold">
            {t('paletteTitle')}
          </div>
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                setTheme(theme.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                themeId === theme.id
                  ? 'bg-surface-card text-primary'
                  : 'text-secondary hover:text-primary hover:bg-surface-card\/50'
              }`}
            >
              <div className="flex gap-1">
                <div
                  className="w-4 h-4 rounded-full border border-default\/30"
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <div
                  className="w-4 h-4 rounded-full border border-default\/30"
                  style={{ backgroundColor: theme.colors.background }}
                />
                <div
                  className="w-4 h-4 rounded-full border border-default\/30"
                  style={{ backgroundColor: theme.colors.text }}
                />
              </div>
              <span>{theme.name}</span>
            </button>
          ))}

          {/* Custom theme option */}
          <div className="mx-2 mt-1 border-t border-subtle" />
          <button
            onClick={() => {
              setTheme('custom');
              setShowCustom(true);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors mt-1 ${
              themeId === 'custom'
                ? 'bg-surface-card text-primary'
                : 'text-secondary hover:text-primary hover:bg-surface-card\/50'
            }`}
          >
            <div className="flex gap-1">
              <div
                className="w-4 h-4 rounded-full border border-default\/30"
                style={{ backgroundColor: customColors.primary }}
              />
              <div
                className="w-4 h-4 rounded-full border border-default\/30"
                style={{ backgroundColor: customColors.background }}
              />
              <div
                className="w-4 h-4 rounded-full border border-default\/30"
                style={{ backgroundColor: customColors.text }}
              />
            </div>
            <span className="flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5" />
              {t('custom')}
            </span>
          </button>
        </div>
      )}

      {/* Custom theme editor */}
      {open && showCustom && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-surface-card border border-default\/15 rounded-lg shadow-xl z-50 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <button
              onClick={() => setShowCustom(false)}
              className="text-muted hover:text-secondary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">
              {t('customTheme')}
            </span>
          </div>

          <div className="px-3 pb-2 space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
            {colorLabels.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-2 py-1">
                <span className="text-[11px] text-secondary shrink-0">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted font-mono uppercase">
                    {customColors[key]}
                  </span>
                  <label className="relative cursor-pointer">
                    <div
                      className="w-6 h-6 rounded-md border border-default\/30 hover:border-default transition-colors"
                      style={{ backgroundColor: customColors[key] }}
                    />
                    <input
                      type="color"
                      value={customColors[key]}
                      onChange={(e) => setCustomThemeColor(key, e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

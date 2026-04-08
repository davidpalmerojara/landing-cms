'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, Layout } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { translateFieldDefinition, translateStyleField, translateStyleGroupLabel } from '@/lib/editor-i18n';
import { resolveStyles } from '@/types/blocks';
import type { BlockStyles } from '@/types/blocks';
import type { FieldDefinition } from '@/types/inspector';
import { styleGroups, getStyleFieldsByGroup } from '@/lib/block-styles-config';

// --- Theme colors for color picker grid ---
const PRESET_COLORS = [
  '#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6',
  '#adb5bd', '#6c757d', '#495057', '#212529',
  '#2563EB', '#2563EB', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#000000',
];

type Section = 'content' | 'styles';

interface MobileBlockEditorProps {
  blockId: string;
}

export default function MobileBlockEditor({ blockId }: MobileBlockEditorProps) {
  const t = useTranslations();
  const locale = useLocale();
  const block = useEditorStore((s) => s.page.blocks.find((b) => b.id === blockId));
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const [openSection, setOpenSection] = useState<Section>('content');

  const toggleSection = useCallback((section: Section) => {
    setOpenSection((prev) => (prev === section ? section : section));
  }, []);

  if (!block) return null;

  const config = blockRegistry[block.type];
  const fields = (config?.fields || []).map((field) => translateFieldDefinition(field, locale));
  const BlockIcon = config?.icon || Layout;
  const styles = resolveStyles(block, 'desktop');

  const handleStyleChange = (key: keyof BlockStyles, value: unknown) => {
    updateBlockStyle(blockId, key, value);
  };

  return (
    <div className="pb-8">
      {/* Block header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-default/15 bg-surface-card\/40">
        <div className="w-10 h-10 rounded-xl bg-primary\/10 flex items-center justify-center border border-[#2563EB]/20">
          <BlockIcon size={18} className="text-primary-color" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{getTranslatedBlockLabel(block.type, t, config?.label || block.type)}</p>
          <p className="text-xs text-[#888] uppercase tracking-wider">{block.type}</p>
        </div>
      </div>

      {/* Content section */}
      <SectionAccordion
        title={t('editor.content')}
        isOpen={openSection === 'content'}
        onToggle={() => toggleSection('content')}
      >
        <div className="space-y-5 px-5 pb-5">
          {fields.map((field) => (
            <MobileField
              key={field.key}
              field={field}
              value={block.data[field.key]}
              onChange={(value) => updateBlock(blockId, field.key, value)}
            />
          ))}
        </div>
      </SectionAccordion>

      {/* Styles section */}
      <SectionAccordion
        title={t('editor.styles')}
        isOpen={openSection === 'styles'}
        onToggle={() => toggleSection('styles')}
      >
        <div className="space-y-6 px-5 pb-5">
          {styleGroups.map((group) => {
            const groupFields = getStyleFieldsByGroup(group.key).map((field) => translateStyleField(field, locale));
            if (groupFields.length === 0) return null;

            return (
              <div key={group.key} className="space-y-2">
                <label className="text-xs font-semibold text-[#888] uppercase tracking-wider">
                  {translateStyleGroupLabel(group.key, locale)}
                </label>
                {group.key === 'background' ? (
                  groupFields.map((sf) => (
                    <MobileColorPicker
                      key={sf.key}
                      value={(styles[sf.key] as string) || ''}
                      onChange={(v) => handleStyleChange(sf.key, v)}
                    />
                  ))
                ) : group.key === 'border' ? (
                  groupFields.map((sf) => (
                    <MobileSlider
                      key={sf.key}
                      label=""
                      value={styles[sf.key] as number}
                      max={sf.max || 48}
                      onChange={(v) => handleStyleChange(sf.key, v)}
                    />
                  ))
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {groupFields.map((sf) => (
                      <MobileSlider
                        key={sf.key}
                        label={sf.label}
                        value={styles[sf.key] as number}
                        max={sf.max || 200}
                        onChange={(v) => handleStyleChange(sf.key, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionAccordion>
    </div>
  );
}

// --- Accordion section ---

function SectionAccordion({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-default/15">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-5 py-4 min-h-11 active:bg-surface-card\/40"
      >
        <span className="text-sm font-medium text-secondary">{title}</span>
        <ChevronDown
          size={18}
          className={`text-[#666] transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && children}
    </div>
  );
}

// --- Mobile field renderer (native inputs) ---

function MobileField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const fieldId = `mobile-field-${field.key}`;

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <input
            id={fieldId}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-white text-sm placeholder-muted focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <textarea
            id={fieldId}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-white text-sm placeholder-muted focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all resize-none"
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <select
            id={fieldId}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-white text-sm focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all appearance-auto"
          >
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between py-1">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <input
            id={fieldId}
            type="checkbox"
            role="switch"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-11 h-6 rounded-full appearance-none cursor-pointer relative transition-colors duration-200 checked:bg-[#2563EB] bg-surface-card
              before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition-transform before:duration-200 checked:before:translate-x-5"
          />
        </div>
      );

    case 'color':
      return (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#888]">{field.label}</label>
          <MobileColorPicker value={(value as string) || ''} onChange={onChange} />
        </div>
      );

    case 'image':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <input
            id={fieldId}
            type="url"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-white text-sm placeholder-muted focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
          />
          {typeof value === 'string' && value && (
            <div className="w-full h-24 rounded-lg bg-surface-card border border-default/15 overflow-hidden">
              <img
                src={value as string}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-[#888]">
            {field.label}
          </label>
          <input
            id={fieldId}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-surface-card border border-default/15 text-white text-sm focus:border-[#2563EB]/50 focus:ring-1 focus:ring-[#2563EB]/30 outline-none transition-all"
          />
        </div>
      );
  }
}

// --- Mobile color picker (grid, not wheel) ---

function MobileColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations('inspector');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-11 h-11 rounded-lg border-2 transition-all active:scale-95 ${
              value === color ? 'border-[#2563EB] ring-2 ring-[#2563EB]/30' : 'border-default\/30'
            }`}
            style={{ backgroundColor: color }}
            aria-label={t('colorOption', { value: color })}
          />
        ))}
      </div>
      {showCustom ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 px-3 py-2.5 rounded-lg bg-surface-card border border-default/15 text-white text-sm font-mono focus:border-[#2563EB]/50 outline-none"
          />
          <div
            className="w-10 h-10 rounded-lg border border-default\/30 flex-shrink-0"
            style={{ backgroundColor: value || 'transparent' }}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowCustom(true)}
          className="text-xs text-primary-color active:opacity-70 font-medium min-h-11 flex items-center"
        >
          {t('customizeColor')}
        </button>
      )}
    </div>
  );
}

// --- Native range slider ---

function MobileSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#666]">{label}</span>
          <span className="text-[11px] text-[#888] font-mono">{value}px</span>
        </div>
      )}
      {!label && (
        <div className="flex justify-end">
          <span className="text-[11px] text-[#888] font-mono">{value}px</span>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-[#2563EB] h-1.5"
      />
    </div>
  );
}

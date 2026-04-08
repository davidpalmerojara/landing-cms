'use client';

import {
  Settings, Type, Palette, ChevronDown, Copy, Trash2, Layout,
  Monitor, Tablet, Smartphone,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { translateFieldDefinition, translateStyleField, translateStyleGroupLabel } from '@/lib/editor-i18n';
import { resolveStyles } from '@/types/blocks';
import type { BlockStyles } from '@/types/blocks';
import FieldRenderer from './FieldRenderer';
import SpacingField from './SpacingField';
import ColorField from './ColorField';
import { styleGroups, getStyleFieldsByGroup } from '@/lib/block-styles-config';

export default function Inspector() {
  const t = useTranslations();
  const locale = useLocale();
  const page = useEditorStore((s) => s.page);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const deviceMode = useEditorStore((s) => s.deviceMode);
  const inspectorSections = useEditorStore((s) => s.inspectorSections);
  const toggleInspectorSection = useEditorStore((s) => s.toggleInspectorSection);
  const updateBlock = useEditorStore((s) => s.updateBlock);
  const updateBlockStyle = useEditorStore((s) => s.updateBlockStyle);
  const updateBlockResponsiveStyle = useEditorStore((s) => s.updateBlockResponsiveStyle);
  const requestDeleteBlock = useEditorStore((s) => s.requestDeleteBlock);
  const duplicateBlock = useEditorStore((s) => s.duplicateBlock);

  const selectedBlock = page.blocks.find((b) => b.id === selectedBlockId);

  if (!selectedBlock) {
    return (
      <aside aria-label={t('editor.inspector')} className="w-64 lg:w-72 xl:w-80 bg-surface-card\/80 backdrop-blur-2xl border-l border-default/15 flex flex-col shrink-0 z-20">
        <div className="h-14 flex items-center px-5 border-b border-default/15 shrink-0">
          <h2 className="text-[13px] font-semibold text-primary flex items-center gap-2 tracking-wide">
            <Settings className="w-4 h-4 text-muted" /> {t('editor.inspector')}
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-surface-elevated\/50 flex items-center justify-center border border-default/10">
            <Settings className="w-6 h-6 text-muted" />
          </div>
          <div>
            <p className="font-medium text-secondary mb-1">{t('editor.nothingSelected')}</p>
            <p className="text-[12px] leading-relaxed">
              {t('editor.nothingSelectedDescription')}
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const blockConfig = blockRegistry[selectedBlock.type];
  const blockFields = blockConfig ? blockConfig.fields.map((field) => translateFieldDefinition(field, locale)) : [];
  const BlockIcon = blockConfig?.icon || Layout;

  return (
    <aside aria-label={t('editor.inspector')} className="w-64 lg:w-72 xl:w-80 bg-surface-card\/80 backdrop-blur-2xl border-l border-default/15 flex flex-col shrink-0 z-20">
      <div className="h-14 flex items-center px-5 border-b border-default/15 shrink-0">
        <h2 className="text-[13px] font-semibold text-primary flex items-center gap-2 tracking-wide">
          <Settings className="w-4 h-4 text-muted" /> {t('editor.inspector')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="pb-10">
          {/* Block header */}
          <div className="p-5 border-b border-default/15 bg-surface-elevated/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-primary\/10 flex items-center justify-center border border-[#2563EB]/20">
                <BlockIcon className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div>
                <span className="font-medium text-[13px] text-primary block">{getTranslatedBlockLabel(selectedBlock.type, t, selectedBlock.name)}</span>
                <span className="text-[10px] text-muted uppercase tracking-widest">{selectedBlock.type}</span>
              </div>
            </div>
          </div>

          {!blockConfig ? (
            <div className="p-8 text-center text-muted text-[12px]">
              <div className="bg-surface-elevated\/50 rounded-lg p-4 border border-default/10">
                {t('editor.unknownBlockConfig')}
              </div>
            </div>
          ) : (
            <>
              {/* Content section */}
              <div className="border-b border-default/15">
                <button
                  onClick={() => toggleInspectorSection('content')}
                  aria-expanded={inspectorSections.content}
                  aria-controls="inspector-section-content"
                  className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-secondary">
                    <Type className="w-4 h-4 text-muted" />
                    <span className="text-[12px] font-medium tracking-wide">{t('editor.content')}</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 ${
                      inspectorSections.content ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {inspectorSections.content && (
                  <div id="inspector-section-content" className="px-5 pb-6 space-y-6">
                    {blockFields.map((field) => (
                      <FieldRenderer
                        key={field.key}
                        field={field}
                        value={selectedBlock.data[field.key]}
                        onChange={(value) => updateBlock(selectedBlock.id, field.key, value)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Styles section */}
              <div className="border-b border-default/15">
                <button
                  onClick={() => toggleInspectorSection('styles')}
                  aria-expanded={inspectorSections.styles}
                  aria-controls="inspector-section-styles"
                  className="w-full flex items-center justify-between p-5 hover:bg-surface-elevated/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-secondary">
                    <Palette className="w-4 h-4 text-muted" />
                    <span className="text-[12px] font-medium tracking-wide">{t('editor.styles')}</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 ${
                      inspectorSections.styles ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {inspectorSections.styles && (() => {
                  const styles = resolveStyles(selectedBlock, deviceMode);
                  const isResponsive = deviceMode !== 'desktop';
                  const DeviceIcon = deviceMode === 'mobile' ? Smartphone : deviceMode === 'tablet' ? Tablet : Monitor;

                  const handleStyleChange = (key: keyof BlockStyles, value: unknown) => {
                    if (isResponsive) {
                      updateBlockResponsiveStyle(selectedBlock.id, deviceMode as 'tablet' | 'mobile', key, value);
                    } else {
                      updateBlockStyle(selectedBlock.id, key, value);
                    }
                  };

                  return (
                    <div id="inspector-section-styles" className="px-5 pb-6 space-y-6">
                      {/* Device mode indicator */}
                      {isResponsive && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary\/10 border border-[#2563EB]/20 rounded-lg">
                          <DeviceIcon className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span className="text-[11px] text-[#2563EB] font-medium">
                            {deviceMode === 'mobile' ? t('editor.editingMobileStyles') : t('editor.editingTabletStyles')}
                          </span>
                        </div>
                      )}

                      {styleGroups.map((group) => {
                        const groupFields = getStyleFieldsByGroup(group.key).map((field) => translateStyleField(field, locale));
                        if (groupFields.length === 0) return null;

                        if (group.key === 'background') {
                          return (
                            <div key={group.key} className="space-y-2.5">
                              <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                                {translateStyleGroupLabel(group.key, locale)}
                              </label>
                              <ColorField
                                value={styles.bgColor || ''}
                                onChange={(v) => handleStyleChange('bgColor', v)}
                              />
                              {styles.bgColor && (
                                <button
                                  onClick={() => handleStyleChange('bgColor', '')}
                                  className="text-[10px] text-muted hover:text-secondary transition-colors"
                                >
                                  {t('editor.resetColor')}
                                </button>
                              )}
                            </div>
                          );
                        }

                        if (group.key === 'padding') {
                          return (
                            <SpacingField
                              key={group.key}
                              label={translateStyleGroupLabel(group.key, locale)}
                              top={styles.paddingTop}
                              right={styles.paddingRight}
                              bottom={styles.paddingBottom}
                              left={styles.paddingLeft}
                              onChange={(side, value) =>
                                handleStyleChange(`padding${side}` as keyof BlockStyles, value)
                              }
                            />
                          );
                        }

                        if (group.key === 'margin') {
                          return (
                            <SpacingField
                              key={group.key}
                              label={translateStyleGroupLabel(group.key, locale)}
                              top={styles.marginTop}
                              right={0}
                              bottom={styles.marginBottom}
                              left={0}
                              onChange={(side, value) => {
                                if (side === 'Top' || side === 'Bottom') {
                                  handleStyleChange(`margin${side}` as keyof BlockStyles, value);
                                }
                              }}
                            />
                          );
                        }

                        if (group.key === 'border') {
                          const borderField = groupFields[0];
                          return (
                            <div key={group.key} className="space-y-2.5">
                              <label className="text-[10px] font-bold text-muted uppercase tracking-widest block">
                                {borderField.label}
                              </label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min={0}
                                  max={borderField.max || 48}
                                  value={styles.borderRadius}
                                  onChange={(e) =>
                                    handleStyleChange('borderRadius', parseInt(e.target.value, 10))
                                  }
                                  className="flex-1 accent-[#2563EB] h-1.5"
                                />
                                <span className="text-[12px] text-secondary font-mono w-10 text-right">
                                  {styles.borderRadius}px
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* Footer actions */}
          <div className="p-5 mt-2 flex gap-2">
            <button
              onClick={() => duplicateBlock(selectedBlock.id)}
              className="flex-1 py-2.5 px-2 bg-surface-elevated\/50 border border-default/10 text-secondary rounded-lg text-[11px] font-medium hover:bg-surface-card hover:text-primary transition-all flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> {t('common.duplicate')}
            </button>
            <button
              onClick={() => requestDeleteBlock(selectedBlock.id)}
              className="flex-1 py-2.5 px-2 bg-transparent border border-red-900/30 text-red-400 rounded-lg text-[11px] font-medium hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Layout, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { blockRegistry, getBlockFields } from '@/lib/block-registry';
import BlockFields from '@/components/inspector/BlockFields';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { translateFieldDefinition } from '@/lib/editor-i18n';
import { isAcceptedLink, normalizeLink } from '@/lib/field-limits';
import type { ScalarFieldDefinition } from '@/types/inspector';
import MobileAiBlockEdit from './MobileAiBlockEdit';
import MobileImageField from './MobileImageField';
import MobileBlockStyles from './MobileBlockStyles';
import MobileSelect from './MobileSelect';

type Section = 'content' | 'styles';

interface MobileBlockEditorProps {
  blockId: string;
}

export default function MobileBlockEditor({ blockId }: MobileBlockEditorProps) {
  const t = useTranslations();
  const locale = useLocale();
  const block = useEditorStore((s) => s.page.blocks.find((b) => b.id === blockId));
  const pageId = useEditorStore((s) => s.page.id);
  const [openSection, setOpenSection] = useState<Section>('content');
  const [showAi, setShowAi] = useState(false);
  const stylesRef = useRef<HTMLDivElement>(null);
  // A page that only exists in this browser (not saved yet) has nothing for the AI to edit
  const canUseAi = !pageId.startsWith('page_');

  const toggleSection = useCallback((section: Section) => {
    setOpenSection(section);
  }, []);

  // Opening "Estilos" shows it from its start, not wherever the content was scrolled (QA-105)
  useEffect(() => {
    if (openSection === 'styles') stylesRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [openSection]);

  if (!block) return null;

  const config = blockRegistry[block.type];
  const fields = getBlockFields(block.type).map((field) => translateFieldDefinition(field, locale));
  const BlockIcon = config?.icon || Layout;

  return (
    <div className="pb-8">
      {/* Block header: its name (no raw type id, QA-081) and the AI action */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-default/15 bg-surface-card/40">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          <BlockIcon size={18} className="text-primary-color" aria-hidden="true" />
        </div>
        <p className="flex-1 min-w-0 text-sm font-semibold text-primary truncate">
          {getTranslatedBlockLabel(block.type, t, config?.label || block.type)}
        </p>
        {canUseAi && (
          <button
            type="button"
            onClick={() => setShowAi((open) => !open)}
            aria-expanded={showAi}
            className="shrink-0 min-h-11 px-3 flex items-center gap-1.5 rounded-xl border border-violet-500/40 text-[13px] font-semibold text-primary active:opacity-80"
          >
            <Sparkles size={15} className="text-violet-400" aria-hidden="true" />
            {t('mobile.improveWithAi')}
          </button>
        )}
      </div>

      {showAi && canUseAi && (
        <MobileAiBlockEdit pageId={pageId} blockId={block.id} onDone={() => setShowAi(false)} />
      )}

      {/* Content section */}
      <SectionAccordion
        title={t('editor.content')}
        isOpen={openSection === 'content'}
        onToggle={() => toggleSection('content')}
      >
        <div className="space-y-5 px-5 pb-5">
          <BlockFields
            key={block.id}
            block={block}
            fields={fields}
            idPrefix="mobile-field"
            variant="mobile"
            renderScalar={(field, value, onChange, inputId) => (
              <MobileField field={field} value={value} onChange={onChange} id={inputId} />
            )}
          />
        </div>
      </SectionAccordion>

      {/* Styles section */}
      <div ref={stylesRef} className="scroll-mt-2">
        <SectionAccordion
          title={t('editor.styles')}
          isOpen={openSection === 'styles'}
          onToggle={() => toggleSection('styles')}
        >
          <MobileBlockStyles block={block} />
        </SectionAccordion>
      </div>
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
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-5 py-4 min-h-11 active:bg-surface-card/40"
      >
        <span className="text-sm font-medium text-secondary">{title}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`text-muted transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && children}
    </div>
  );
}

// --- Mobile field renderer (native inputs) ---

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-surface-card border text-primary text-base placeholder-muted focus:ring-1 outline-none transition-all';

function inputBorder(invalid: boolean): string {
  return invalid
    ? 'border-error/70 focus:border-error focus:ring-error/30'
    : 'border-default/15 focus:border-primary/50 focus:ring-primary/30';
}

function MobileField({
  field,
  value,
  onChange,
  id: fieldId,
}: {
  field: ScalarFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  id: string;
}) {
  const t = useTranslations();
  const text = typeof value === 'string' ? value : '';
  // A link is checked once the user leaves the field, not while typing it
  const [linkTouched, setLinkTouched] = useState(false);
  const isLink = field.type === 'text' && field.format === 'link';
  const maxLength = field.type === 'text' || field.type === 'textarea' ? field.maxLength : undefined;
  const linkError = isLink && linkTouched && !isAcceptedLink(text) ? t('saveStatus.rules.link') : undefined;
  const error = field.error ?? linkError;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : undefined;
  const errorText = error ? <p id={errorId} className="text-xs text-error">{error}</p> : null;

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-secondary">
            {field.label}
          </label>
          <input
            id={fieldId}
            type="text"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onBlur={isLink ? () => {
              setLinkTouched(true);
              const normalized = normalizeLink(text);
              if (normalized !== text) onChange(normalized);
            } : undefined}
            maxLength={maxLength}
            // Links get the keyboard with "/" and ".", no capital first letter, no autocorrect (QA-105)
            inputMode={isLink ? 'url' : undefined}
            autoCapitalize={isLink ? 'none' : undefined}
            autoCorrect={isLink ? 'off' : undefined}
            spellCheck={isLink ? false : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${INPUT_CLASS} ${inputBorder(Boolean(error))}`}
          />
          {errorText}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-secondary">
            {field.label}
          </label>
          <textarea
            id={fieldId}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            rows={3}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${INPUT_CLASS} ${inputBorder(Boolean(error))} resize-none`}
          />
          {errorText}
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-secondary">
            {field.label}
          </label>
          <MobileSelect
            id={fieldId}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            invalid={Boolean(error)}
          >
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </MobileSelect>
          {errorText}
        </div>
      );

    case 'toggle':
      return (
        <label htmlFor={fieldId} className="flex items-center justify-between gap-4 min-h-11 py-1 cursor-pointer">
          <span className="text-xs font-semibold text-secondary">{field.label}</span>
          <input
            id={fieldId}
            type="checkbox"
            role="switch"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="shrink-0 w-11 h-6 rounded-full appearance-none cursor-pointer relative transition-colors duration-200 checked:bg-primary bg-default
              before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition-transform before:duration-200 checked:before:translate-x-5"
          />
        </label>
      );

    case 'color':
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="text-xs font-semibold text-secondary">{field.label}</label>
          <input
            id={fieldId}
            type="text"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            className={`${INPUT_CLASS} ${inputBorder(Boolean(error))} font-mono`}
          />
          {errorText}
        </div>
      );

    case 'image':
      return (
        <MobileImageField
          id={fieldId}
          label={field.label}
          value={text}
          onChange={onChange}
          error={error}
        />
      );
  }
}

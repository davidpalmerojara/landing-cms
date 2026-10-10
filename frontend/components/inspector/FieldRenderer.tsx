import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScalarFieldDefinition } from '@/types/inspector';
import { isAcceptedLink, normalizeLink } from '@/lib/field-limits';
import TextField from './TextField';
import TextAreaField from './TextAreaField';
import SelectField from './SelectField';
import ColorField from './ColorField';
import ToggleField from './ToggleField';
import ImageField from './ImageField';

interface FieldRendererProps {
  field: ScalarFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Id of the input; defaults to one derived from the field key. */
  id?: string;
}

/** Counters appear on long fields, and on short ones once they are nearly full. */
const COUNTER_FROM = 0.8;

export default function FieldRenderer({ field, value, onChange, id }: FieldRendererProps) {
  const t = useTranslations();
  const fieldId = id ?? `field-${field.key}`;
  const labelId = `${fieldId}-label`;
  const errorId = `${fieldId}-error`;
  const counterId = `${fieldId}-counter`;
  const text = typeof value === 'string' ? value : '';
  // A link is checked once the user leaves the field, not while typing it
  const [linkTouched, setLinkTouched] = useState(false);

  const maxLength = field.type === 'text' || field.type === 'textarea' ? field.maxLength : undefined;
  const isLink = field.type === 'text' && field.format === 'link';
  const linkError = isLink && linkTouched && !isAcceptedLink(text) ? t('saveStatus.rules.link') : undefined;
  const error = field.error ?? linkError;
  const showCounter = maxLength !== undefined && (field.type === 'textarea' || text.length >= maxLength * COUNTER_FROM);
  const describedBy = [error ? errorId : null, showCounter ? counterId : null].filter(Boolean).join(' ') || undefined;

  const completeLink = () => {
    setLinkTouched(true);
    const normalized = normalizeLink(text);
    if (normalized !== text) onChange(normalized);
  };

  const renderField = () => {
    switch (field.type) {
      case 'textarea':
        return (
          <TextAreaField
            id={fieldId}
            value={text}
            onChange={onChange}
            maxLength={maxLength}
            invalid={Boolean(error)}
            describedBy={describedBy}
          />
        );
      case 'select':
        return <SelectField id={fieldId} value={text} options={field.options} onChange={onChange} />;
      case 'color':
        return <ColorField id={fieldId} labelId={labelId} value={text || '#ffffff'} onChange={onChange} />;
      case 'toggle':
        return <ToggleField id={fieldId} value={value === true} onChange={onChange} />;
      case 'image':
        return <ImageField id={fieldId} labelId={labelId} value={text} onChange={onChange} />;
      default:
        return (
          <TextField
            id={fieldId}
            value={text}
            onChange={onChange}
            onBlur={isLink ? completeLink : undefined}
            maxLength={maxLength}
            invalid={Boolean(error)}
            describedBy={describedBy}
            inputMode={isLink ? 'url' : undefined}
          />
        );
    }
  };

  return (
    <div className={`${field.type === 'toggle' ? 'flex items-center justify-between' : 'space-y-2.5'}`}>
      <label id={labelId} htmlFor={fieldId} className="text-[10px] font-bold text-muted uppercase tracking-widest">
        {field.label}
      </label>
      {renderField()}
      {(error || showCounter) && (
        <div className="flex items-start justify-between gap-2 text-[11px] leading-snug">
          {error ? <p id={errorId} className="text-error">{error}</p> : <span />}
          {showCounter && maxLength !== undefined && (
            <span id={counterId} className="text-muted tabular-nums shrink-0">
              {t('saveStatus.charCount', { count: text.length, max: maxLength })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

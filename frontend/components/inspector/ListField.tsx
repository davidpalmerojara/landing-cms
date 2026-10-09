'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import clsx from 'clsx';
import { getAtPath } from '@/lib/block-data';
import type { ListFieldDefinition, ScalarFieldDefinition } from '@/types/inspector';

type Variant = 'desktop' | 'mobile';
type FocusKind = 'toggle' | 'up' | 'down' | 'add' | 'firstField';

interface ListFieldProps {
  field: ListFieldDefinition;
  items: readonly unknown[];
  /** Prefix for element ids, unique per editor surface ('field', 'mobile-field'). */
  idPrefix: string;
  /** 'mobile' makes every control a 44px touch target. */
  variant?: Variant;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  /** Renders one field of item `index`; `inputId` must go on its input. */
  renderField: (itemField: ScalarFieldDefinition, index: number, inputId: string) => ReactNode;
}

/** Text of the item's first text field, shown next to its title. */
function itemSummary(item: unknown, fields: ScalarFieldDefinition[]): string {
  const textField = fields.find((f) => f.type === 'text' || f.type === 'textarea');
  if (!textField) return '';
  const value = getAtPath(item, [textField.key]);
  return typeof value === 'string' ? value : '';
}

/** Where focus goes after each structural change, so keyboard users keep their place. */
function focusAfterMove(to: number, direction: -1 | 1, length: number): FocusKind {
  if (direction === -1) return to === 0 ? 'down' : 'up';
  return to === length - 1 ? 'up' : 'down';
}

/**
 * Editor for a list field: collapsible items with their fields, add (up to
 * maxItems), remove and move up/down. Shared by the desktop inspector and the
 * mobile editor, which pass their own field renderer.
 */
export default function ListField({
  field,
  items,
  idPrefix,
  variant = 'desktop',
  onAdd,
  onRemove,
  onMove,
  renderField,
}: ListFieldProps) {
  const t = useTranslations('inspector');
  const locale = useLocale();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<{ kind: FocusKind; index: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const isMobile = variant === 'mobile';
  const baseId = `${idPrefix}-${field.key}`;
  const itemName = field.itemLabel.toLocaleLowerCase(locale);
  const atMax = items.length >= field.maxItems;

  // Focus the element chosen by the last action once the new list is rendered
  useEffect(() => {
    const target = pendingFocus.current;
    const root = rootRef.current;
    if (!target || !root) return;
    pendingFocus.current = null;
    const panel = `[data-list-panel="${target.index}"]`;
    const selector = target.kind === 'firstField'
      ? `${panel} input, ${panel} textarea, ${panel} select, ${panel} button`
      : `[data-list-focus="${target.kind}-${target.index}"]`;
    root.querySelector<HTMLElement>(selector)?.focus();
  }, [items]);

  const handleAdd = () => {
    if (atMax) return;
    const index = items.length;
    pendingFocus.current = { kind: 'firstField', index };
    setOpenIndex(index);
    setAnnouncement(t('listAnnounceAdded', { item: field.itemLabel, position: index + 1 }));
    onAdd();
  };

  const handleRemove = (index: number) => {
    const remaining = items.length - 1;
    pendingFocus.current = remaining === 0
      ? { kind: 'add', index: 0 }
      : { kind: 'toggle', index: Math.min(index, remaining - 1) };
    setOpenIndex((open) => (open === null || open === index ? null : open > index ? open - 1 : open));
    setAnnouncement(t('listAnnounceRemoved', { item: field.itemLabel, position: index + 1 }));
    onRemove(index);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    pendingFocus.current = { kind: focusAfterMove(to, direction, items.length), index: to };
    setOpenIndex((open) => (open === index ? to : open === to ? index : open));
    setAnnouncement(t('listAnnounceMoved', { item: field.itemLabel, position: to + 1 }));
    onMove(index, to);
  };

  const iconButtonClass = clsx(
    'shrink-0 flex items-center justify-center rounded-md text-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
    'hover:text-primary hover:bg-surface-card active:bg-surface-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
    isMobile ? 'min-w-11 min-h-11' : 'w-7 h-7',
  );

  return (
    <div ref={rootRef} className="space-y-2.5" role="group" aria-labelledby={`${baseId}-label`}>
      <div className="flex items-center justify-between">
        <span
          id={`${baseId}-label`}
          className={isMobile ? 'text-xs font-semibold text-secondary' : 'text-[10px] font-bold text-muted uppercase tracking-widest'}
        >
          {field.label}
        </span>
        <span className="text-[11px] text-muted font-mono">
          {t('listCount', { count: items.length, max: field.maxItems })}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-[12px] text-muted px-3 py-4 text-center rounded-lg border border-dashed border-default/20">
          {t('listEmpty')}
        </p>
      ) : (
        <ul className="space-y-2" aria-labelledby={`${baseId}-label`}>
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            const position = index + 1;
            const toggleId = `${baseId}-${index}-toggle`;
            const panelId = `${baseId}-${index}-panel`;
            return (
              <li key={index} className="rounded-lg border border-default/15 bg-surface-elevated/30">
                <div className="flex items-center gap-0.5 p-1">
                  <button
                    type="button"
                    id={toggleId}
                    data-list-focus={`toggle-${index}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className={clsx(
                      'flex-1 min-w-0 flex items-center gap-2 px-1.5 rounded-md text-left hover:bg-surface-card/60 active:bg-surface-card/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                      isMobile ? 'min-h-11' : 'py-1.5',
                    )}
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={clsx('w-3.5 h-3.5 shrink-0 text-muted transition-transform duration-200', !isOpen && '-rotate-90')}
                    />
                    <span className="text-[12px] font-medium text-secondary shrink-0">
                      {t('listItemTitle', { item: field.itemLabel, position })}
                    </span>
                    <span className="text-[11px] text-muted truncate">{itemSummary(item, field.itemFields)}</span>
                  </button>
                  <button
                    type="button"
                    data-list-focus={`up-${index}`}
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label={t('listMoveUp', { item: itemName, position })}
                    className={iconButtonClass}
                  >
                    <ArrowUp aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    data-list-focus={`down-${index}`}
                    disabled={index === items.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label={t('listMoveDown', { item: itemName, position })}
                    className={iconButtonClass}
                  >
                    <ArrowDown aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    data-list-focus={`remove-${index}`}
                    onClick={() => handleRemove(index)}
                    aria-label={t('listRemove', { item: itemName, position })}
                    className={clsx(iconButtonClass, 'hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/10')}
                  >
                    <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                </div>
                {isOpen && (
                  <div
                    id={panelId}
                    role="group"
                    aria-labelledby={toggleId}
                    data-list-panel={index}
                    className={clsx('border-t border-default/10 px-3 pb-3 pt-3', isMobile ? 'space-y-5' : 'space-y-4')}
                  >
                    {field.itemFields.map((itemField) => (
                      <div key={itemField.key}>
                        {renderField(itemField, index, `${baseId}-${index}-${itemField.key}`)}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        data-list-focus="add-0"
        onClick={handleAdd}
        aria-disabled={atMax}
        aria-describedby={atMax ? `${baseId}-max` : undefined}
        className={clsx(
          'w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-default/20 bg-surface-elevated/30 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
          isMobile ? 'min-h-11' : 'py-2',
          atMax
            ? 'text-muted opacity-60 cursor-not-allowed'
            : 'text-secondary hover:text-primary hover:bg-surface-card active:bg-surface-card hover:border-primary/40',
        )}
      >
        <Plus aria-hidden="true" className="w-3.5 h-3.5" />
        {t('listAdd', { item: itemName })}
      </button>
      {atMax && (
        <p id={`${baseId}-max`} className="text-[11px] text-muted">
          {t('listMaxReached', { max: field.maxItems })}
        </p>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}

'use client';

import { Fragment, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { getAtPath } from '@/lib/block-data';
import { getNewListItem } from '@/lib/block-defaults';
import { fieldLimit } from '@/lib/field-limits';
import { ruleMessageText } from '@/lib/api-errors';
import { refusalFor } from '@/lib/save-issue';
import type { SaveIssue } from '@/lib/page-sync';
import type { DataPath } from '@/types/block-data';
import type { Block } from '@/types/blocks';
import type { FieldDefinition, ScalarFieldDefinition } from '@/types/inspector';
import ListField from './ListField';

export type ScalarFieldRenderer = (
  field: ScalarFieldDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  inputId: string,
) => ReactNode;

interface BlockFieldsProps {
  block: Block;
  /** Already translated */
  fields: FieldDefinition[];
  idPrefix: string;
  variant?: 'desktop' | 'mobile';
  /** How one scalar field looks on this surface (inspector or mobile editor). */
  renderScalar: ScalarFieldRenderer;
}

function listItems(block: Block, key: string): unknown[] {
  const value = getAtPath(block.data, [key]);
  return Array.isArray(value) ? value : [];
}

/**
 * The field as it renders for this block: the server's length limit and link
 * format (lib/field-limits), and why the server refused its value, if it did.
 */
function withServerRules(
  field: ScalarFieldDefinition,
  block: Block,
  path: DataPath,
  value: unknown,
  issue: SaveIssue | null,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): ScalarFieldDefinition {
  const refusal = refusalFor(issue, block.id, path, value);
  const error = refusal ? ruleMessageText(refusal.message, t) : undefined;
  if (field.type === 'select' || field.type === 'toggle') return error ? { ...field, error } : field;
  const limit = fieldLimit(block.type, path);
  return {
    ...field,
    ...(limit ? { maxLength: limit.maxLength, format: limit.format } : {}),
    ...(error ? { error } : {}),
  };
}

/** Content fields of a block, wired to the store. List fields get the list editor. */
export default function BlockFields({ block, fields, idPrefix, variant = 'desktop', renderScalar }: BlockFieldsProps) {
  const locale = useLocale();
  const t = useTranslations();
  const saveIssue = useEditorStore((s) => s.saveIssue);
  const updateBlockField = useEditorStore((s) => s.updateBlockField);
  const addListItem = useEditorStore((s) => s.addListItem);
  const removeListItem = useEditorStore((s) => s.removeListItem);
  const moveListItem = useEditorStore((s) => s.moveListItem);

  return (
    <>
      {fields.map((field) => {
        if (field.type !== 'list') {
          const value = getAtPath(block.data, [field.key]);
          return (
            <Fragment key={field.key}>
              {renderScalar(
                withServerRules(field, block, [field.key], value, saveIssue, t),
                value,
                (value) => updateBlockField(block.id, [field.key], value),
                `${idPrefix}-${field.key}`,
              )}
            </Fragment>
          );
        }
        return (
          <ListField
            key={field.key}
            field={field}
            items={listItems(block, field.key)}
            idPrefix={idPrefix}
            variant={variant}
            onAdd={() => {
              const item = getNewListItem(block.type, field.key, locale);
              if (item) addListItem(block.id, field.key, item);
            }}
            onRemove={(index) => removeListItem(block.id, field.key, index)}
            onMove={(from, to) => moveListItem(block.id, field.key, from, to)}
            renderField={(itemField, index, inputId) => {
              const path = [field.key, index, itemField.key];
              const value = getAtPath(block.data, path);
              return renderScalar(
                withServerRules(itemField, block, path, value, saveIssue, t),
                value,
                (value) => updateBlockField(block.id, path, value),
                inputId,
              );
            }}
          />
        );
      })}
    </>
  );
}

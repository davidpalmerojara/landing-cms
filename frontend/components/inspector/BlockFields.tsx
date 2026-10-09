'use client';

import { Fragment, type ReactNode } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { getAtPath } from '@/lib/block-data';
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

/** Content fields of a block, wired to the store. List fields get the list editor. */
export default function BlockFields({ block, fields, idPrefix, variant = 'desktop', renderScalar }: BlockFieldsProps) {
  const updateBlockField = useEditorStore((s) => s.updateBlockField);
  const addListItem = useEditorStore((s) => s.addListItem);
  const removeListItem = useEditorStore((s) => s.removeListItem);
  const moveListItem = useEditorStore((s) => s.moveListItem);

  return (
    <>
      {fields.map((field) => {
        if (field.type !== 'list') {
          return (
            <Fragment key={field.key}>
              {renderScalar(
                field,
                getAtPath(block.data, [field.key]),
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
            onAdd={() => addListItem(block.id, field.key, field.newItem)}
            onRemove={(index) => removeListItem(block.id, field.key, index)}
            onMove={(from, to) => moveListItem(block.id, field.key, from, to)}
            renderField={(itemField, index, inputId) => {
              const path = [field.key, index, itemField.key];
              return renderScalar(
                itemField,
                getAtPath(block.data, path),
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

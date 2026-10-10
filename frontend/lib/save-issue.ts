/**
 * Words for a save problem (the store's `saveIssue`, set by lib/page-sync):
 * which field the server refused, where it is, and what is wrong with it.
 *
 *   describeRejectedField(field, t, locale)
 *   -> { label: 'Hero › Enlace del botón', message: 'Usa https://…', inputId: 'field-buttonLink' }
 */
import { deepEqual } from '@/lib/page-merge';
import { getBlockFields } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import { translateFieldDefinition } from '@/lib/editor-i18n';
import { ruleMessageText } from '@/lib/api-errors';
import type { Translate } from '@/lib/api-errors';
import type { RejectedField, SaveIssue } from '@/lib/page-sync';
import type { DataPath } from '@/types/block-data';

export interface RejectedFieldText {
  /** Where the field is: "Hero › Enlace del botón", "Navbar › Enlace 2 › Destino", "Título SEO" */
  label: string;
  /** What the server wants, in the interface language */
  message: string;
  /** The inspector input that edits the field (desktop), when it has one */
  inputId: string | null;
}

/** The inspector's id for the input of `path` in a block (see Inspector, BlockFields, ListField). */
export function inspectorInputId(path: DataPath): string | null {
  if (path.length === 1) return `field-${path[0]}`;
  if (path.length === 3 && typeof path[1] === 'number') return `field-${path[0]}-${path[1]}-${path[2]}`;
  return null;
}

function blockFieldLabel(field: RejectedField, t: Translate, locale: string): string {
  if (!field.blockType) return '';
  const blockLabel = getTranslatedBlockLabel(field.blockType, t);
  if (field.path.length === 0) return blockLabel;
  const definitions = getBlockFields(field.blockType).map((f) => translateFieldDefinition(f, locale));
  const top = definitions.find((f) => f.key === field.path[0]);
  if (!top) return blockLabel;
  if (top.type !== 'list' || field.path.length < 3 || typeof field.path[1] !== 'number') {
    return `${blockLabel} › ${top.label}`;
  }
  const item = top.itemFields.find((f) => f.key === field.path[2]);
  const itemLabel = `${top.itemLabel} ${field.path[1] + 1}`;
  return [blockLabel, itemLabel, item?.label].filter(Boolean).join(' › ');
}

export function describeRejectedField(field: RejectedField, t: Translate, locale: string): RejectedFieldText {
  const message = ruleMessageText(field.message, t);
  if (field.blockId === null) {
    const key = String(field.path[field.path.length - 1]);
    return { label: t(`saveStatus.pageFields.${key}`), message, inputId: null };
  }
  return {
    label: blockFieldLabel(field, t, locale),
    message,
    inputId: inspectorInputId(field.path),
  };
}

/**
 * The refusal that applies to the field at `path` of block `blockId`, if the
 * field still holds the refused value (once changed, it is checked again).
 */
export function refusalFor(
  issue: SaveIssue | null,
  blockId: string,
  path: DataPath,
  currentValue: unknown,
): RejectedField | null {
  if (issue?.kind !== 'rejected') return null;
  return issue.fields.find((field) =>
    field.blockId === blockId && deepEqual(field.path, path) && deepEqual(field.value, currentValue),
  ) ?? null;
}

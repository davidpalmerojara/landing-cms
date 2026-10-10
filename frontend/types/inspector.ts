import type { ItemOf, KeysOfType, ListKeys } from './block-data';

export type ScalarFieldType = 'text' | 'textarea' | 'select' | 'color' | 'toggle' | 'image';
export type FieldType = ScalarFieldType | 'list';

export interface SelectOption {
  value: string;
  label: string;
}

interface FieldBase {
  key: string;
  label: string;
  /**
   * Set while rendering, never in the registry: why the server refused the
   * value the field holds (already translated). See BlockFields.
   */
  error?: string;
}

/** Field holding a string. */
export interface InputFieldDefinition extends FieldBase {
  type: 'text' | 'textarea' | 'color' | 'image';
  /** Set while rendering from lib/field-limits: the server's limit for this field. */
  maxLength?: number;
  /** Set while rendering from lib/field-limits: `link` fields are checked and completed (example.com -> https://). */
  format?: 'text' | 'link' | 'url';
}

export interface SelectFieldDefinition extends FieldBase {
  type: 'select';
  options: SelectOption[];
}

/** Field holding a boolean. */
export interface ToggleFieldDefinition extends FieldBase {
  type: 'toggle';
}

export type ScalarFieldDefinition = InputFieldDefinition | SelectFieldDefinition | ToggleFieldDefinition;

/** Field holding an array of items, each edited with `itemFields`. */
export interface ListFieldDefinition extends FieldBase {
  type: 'list';
  /** Name of one item ("Pregunta"), used in item titles and button labels. */
  itemLabel: string;
  itemFields: ScalarFieldDefinition[];
  maxItems: number;
}

/** A field as the inspector sees it, without the block type. */
export type FieldDefinition = ScalarFieldDefinition | ListFieldDefinition;

// --- Typed variants, used by the block registry so keys are checked against the block's data ---

export type TypedScalarField<T> =
  | (InputFieldDefinition & { key: KeysOfType<T, string> })
  | (SelectFieldDefinition & { key: KeysOfType<T, string> })
  | (ToggleFieldDefinition & { key: KeysOfType<T, boolean> });

export type TypedListField<T> = {
  [P in ListKeys<T>]: Omit<ListFieldDefinition, 'key' | 'itemFields'> & {
    key: P;
    itemFields: TypedScalarField<ItemOf<T[P]>>[];
  };
}[ListKeys<T>];

export type TypedFieldDefinition<T> = TypedScalarField<T> | TypedListField<T>;

export type FieldType = 'text' | 'textarea' | 'select' | 'color' | 'toggle';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
}

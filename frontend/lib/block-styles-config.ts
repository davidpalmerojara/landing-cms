import type { BlockStyles } from '@/types/blocks';

export interface StyleFieldDefinition {
  key: keyof BlockStyles;
  label: string;
  type: 'color' | 'slider';
  group: 'background' | 'padding' | 'margin' | 'border';
  max?: number;
}

export const styleFields: StyleFieldDefinition[] = [
  { key: 'bgColor', label: 'Color de fondo', type: 'color', group: 'background' },
  { key: 'paddingTop', label: 'Arriba', type: 'slider', group: 'padding', max: 200 },
  { key: 'paddingBottom', label: 'Abajo', type: 'slider', group: 'padding', max: 200 },
  { key: 'paddingLeft', label: 'Izquierda', type: 'slider', group: 'padding', max: 200 },
  { key: 'paddingRight', label: 'Derecha', type: 'slider', group: 'padding', max: 200 },
  { key: 'marginTop', label: 'Arriba', type: 'slider', group: 'margin', max: 200 },
  { key: 'marginBottom', label: 'Abajo', type: 'slider', group: 'margin', max: 200 },
  { key: 'borderRadius', label: 'Border Radius', type: 'slider', group: 'border', max: 48 },
];

export const styleGroups = [
  { key: 'background', label: 'Color de fondo' },
  { key: 'padding', label: 'Padding' },
  { key: 'margin', label: 'Margin' },
  { key: 'border', label: 'Border Radius' },
] as const;

export type StyleGroupKey = typeof styleGroups[number]['key'];

/** Get style fields filtered by group */
export function getStyleFieldsByGroup(group: StyleGroupKey): StyleFieldDefinition[] {
  return styleFields.filter((f) => f.group === group);
}

import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { BlockDataMap, BlockType } from './block-data';
import type { TypedFieldDefinition } from './inspector';

export type * from './block-data';

export interface BlockStyles {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  marginTop: number;
  marginBottom: number;
  bgColor: string;
  borderRadius: number;
}

export const defaultBlockStyles: BlockStyles = {
  paddingTop: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  marginTop: 0,
  marginBottom: 0,
  bgColor: '',
  borderRadius: 0,
};

export interface ResponsiveStyles {
  tablet?: Partial<BlockStyles>;
  mobile?: Partial<BlockStyles>;
}

export interface BlockBase {
  id: string;
  name: string;
  styles: BlockStyles;
  responsiveStyles?: ResponsiveStyles;
}

/** A block of one type, its data typed accordingly. */
export interface BlockOf<K extends BlockType> extends BlockBase {
  type: K;
  data: BlockDataMap[K];
}

/** Any block: a union discriminated by `type` (checking `type` narrows `data`). */
export type Block = { [K in BlockType]: BlockOf<K> }[BlockType];

/** Resolve styles for a given device mode by merging base + overrides. */
export function resolveStyles(block: Block, deviceMode: 'desktop' | 'tablet' | 'mobile'): BlockStyles {
  const base = block.styles || defaultBlockStyles;
  if (deviceMode === 'desktop') return base;
  const overrides = block.responsiveStyles?.[deviceMode];
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export interface BlockDefinition<K extends BlockType> {
  type: K;
  /** English name, the fallback; the editor shows the translated name by block type. */
  label: string;
  icon: LucideIcon;
  fields: TypedFieldDefinition<BlockDataMap[K]>[];
  component: ComponentType<BlockProps<BlockDataMap[K]>>;
}

/** One definition per block type; indexing with a type gives that type's definition. */
export type BlockRegistry = { [K in BlockType]: BlockDefinition<K> };

export interface BlockProps<T> {
  blockId: string;
  data: T;
  isPreviewMode: boolean;
}

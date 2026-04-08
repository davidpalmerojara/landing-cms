import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { FieldDefinition } from './inspector';

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

export interface Block {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
  styles: BlockStyles;
  responsiveStyles?: ResponsiveStyles;
}

/** Resolve styles for a given device mode by merging base + overrides. */
export function resolveStyles(block: Block, deviceMode: 'desktop' | 'tablet' | 'mobile'): BlockStyles {
  const base = block.styles || defaultBlockStyles;
  if (deviceMode === 'desktop') return base;
  const overrides = block.responsiveStyles?.[deviceMode];
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export interface BlockDefinition {
  type: string;
  label: string;
  icon: LucideIcon;
  initialData: Record<string, unknown>;
  fields: FieldDefinition[];
  component: ComponentType<BlockProps>;
}

export interface BlockProps {
  blockId: string;
  data: Record<string, unknown>;
  isMobile: boolean;
  isTablet: boolean;
  isPreviewMode: boolean;
}

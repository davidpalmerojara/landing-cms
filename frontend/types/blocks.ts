import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { FieldDefinition } from './inspector';

export interface Block {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
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
  data: Record<string, unknown>;
  isMobile: boolean;
  isTablet: boolean;
  isPreviewMode: boolean;
}

import type { BlockType } from './block-data';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export interface ViewportState {
  zoom: number;
  x: number;
  y: number;
}

export interface InteractionState {
  isPanning: boolean;
  isSpacePressed: boolean;
  isMiddleClickPanning: boolean;
}

export interface DragSource {
  action: 'add' | 'reorder';
  type: BlockType;
  label: string;
  sourceIndex: number | null;
  /** Data of the block to add (normalized by addBlock). */
  initialData?: unknown;
}

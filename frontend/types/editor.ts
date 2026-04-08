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
  type: string;
  label: string;
  sourceIndex: number | null;
  initialData?: Record<string, unknown>;
}

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

'use client';

import { Minus, Plus, Focus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/canvas-zoom';

interface FloatingViewportControlsProps {
  onCenterCanvas: () => void;
  /** One zoom step in (1) or out (-1) around the middle of the canvas */
  onZoomStep: (direction: 1 | -1) => void;
}

const BUTTON_CLASS =
  'p-1.5 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-card active:text-primary active:bg-surface-card rounded-full transition-colors disabled:opacity-40 disabled:pointer-events-none';

export default function FloatingViewportControls({ onCenterCanvas, onZoomStep }: FloatingViewportControlsProps) {
  const t = useTranslations('editor');
  const zoom = useEditorStore((s) => s.viewportState.zoom);
  // Below xl the inspector opens over the canvas (when a block is selected): stay clear of it
  const inspectorOverCanvas = useEditorStore((s) => s.selectedBlockId !== null && !s.isPreviewMode);

  // Clicks here must not reach the canvas, which would clear the selection (QA-077)
  return (
    <div
      data-canvas-controls=""
      onClick={(e) => e.stopPropagation()}
      className={`absolute bottom-6 right-6 flex items-center gap-2 bg-surface-card/90 backdrop-blur-2xl border border-default/15 p-1.5 rounded-full shadow-2xl z-40 transition-all duration-300 ${
        inspectorOverCanvas ? 'max-lg:right-[280px] lg:max-xl:right-[312px]' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onZoomStep(-1)}
        disabled={zoom <= MIN_ZOOM}
        aria-label={t('zoomOut')}
        className={BUTTON_CLASS}
        title={t('zoomOut')}
      >
        <Minus aria-hidden="true" className="w-4 h-4" />
      </button>
      <span className="text-[11px] font-medium text-secondary w-10 text-center select-none cursor-default">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoomStep(1)}
        disabled={zoom >= MAX_ZOOM}
        aria-label={t('zoomIn')}
        className={BUTTON_CLASS}
        title={t('zoomIn')}
      >
        <Plus aria-hidden="true" className="w-4 h-4" />
      </button>
      <div className="w-[1px] h-4 bg-default/30 mx-1" />
      <button
        type="button"
        onClick={onCenterCanvas}
        aria-label={t('centerCanvas')}
        className={BUTTON_CLASS}
        title={t('centerCanvas')}
      >
        <Focus aria-hidden="true" className="w-4 h-4" />
      </button>
    </div>
  );
}

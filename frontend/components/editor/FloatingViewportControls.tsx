'use client';

import { Minus, Plus, Focus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

interface FloatingViewportControlsProps {
  onCenterCanvas: () => void;
}

export default function FloatingViewportControls({ onCenterCanvas }: FloatingViewportControlsProps) {
  const t = useTranslations('editor');
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const zoom = useEditorStore((s) => s.viewportState.zoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);

  return (
    <div
      className={`absolute bottom-6 flex items-center gap-2 bg-surface-card\/90 backdrop-blur-2xl border border-default/15 p-1.5 rounded-full shadow-2xl z-40 transition-all duration-300 ${
        isPreviewMode ? 'right-6' : 'right-[276px] lg:right-[308px] xl:right-[340px]'
      }`}
    >
      <button
        onClick={zoomOut}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-card active:text-primary active:bg-surface-card rounded-full transition-colors"
        title={t('zoomOut')}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="text-[11px] font-medium text-secondary w-10 text-center select-none cursor-default">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={zoomIn}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-card active:text-primary active:bg-surface-card rounded-full transition-colors"
        title={t('zoomIn')}
      >
        <Plus className="w-4 h-4" />
      </button>
      <div className="w-[1px] h-4 bg-default/30 mx-1" />
      <button
        onClick={onCenterCanvas}
        className="p-1.5 text-secondary hover:text-primary hover:bg-surface-card active:text-primary active:bg-surface-card rounded-full transition-colors"
        title={t('centerCanvas')}
      >
        <Focus className="w-4 h-4" />
      </button>
    </div>
  );
}

'use client';

import { Minus, Plus, Focus } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';

interface FloatingViewportControlsProps {
  onCenterCanvas: () => void;
}

export default function FloatingViewportControls({ onCenterCanvas }: FloatingViewportControlsProps) {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  const zoom = useEditorStore((s) => s.viewportState.zoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);

  return (
    <div
      className={`absolute bottom-6 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-1.5 rounded-full shadow-2xl z-40 transition-all duration-300 ${
        isPreviewMode ? 'right-6' : 'right-[340px]'
      }`}
    >
      <button
        onClick={zoomOut}
        className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
        title="Zoom Out"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="text-[11px] font-medium text-zinc-300 w-10 text-center select-none cursor-default">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={zoomIn}
        className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
        title="Zoom In"
      >
        <Plus className="w-4 h-4" />
      </button>
      <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
      <button
        onClick={onCenterCanvas}
        className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
        title="Centrar Canvas"
      >
        <Focus className="w-4 h-4" />
      </button>
    </div>
  );
}

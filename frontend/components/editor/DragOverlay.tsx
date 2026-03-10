'use client';

import { Layers } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';

export default function DragOverlay() {
  const isDragging = useEditorStore((s) => s.isDragging);
  const dragSource = useEditorStore((s) => s.dragSource);
  const dragPosition = useEditorStore((s) => s.dragPosition);

  if (!isDragging || !dragSource) return null;

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: dragPosition.x + 16,
        top: dragPosition.y + 16,
      }}
    >
      <div className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl text-[12px] font-medium flex items-center gap-2 whitespace-nowrap">
        <Layers className="w-4 h-4 opacity-70" />
        <span>
          {dragSource.action === 'reorder'
            ? `Moviendo ${dragSource.label}`
            : dragSource.label}
        </span>
      </div>
    </div>
  );
}

'use client';

import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';

export default function DragOverlay() {
  const t = useTranslations('editor');
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
      <div className="text-white font-bold px-4 py-2 rounded-full shadow-2xl text-[12px] flex items-center gap-2 whitespace-nowrap" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}>
        <Layers className="w-4 h-4 opacity-70" />
        <span>
          {dragSource.action === 'reorder'
            ? t('movingBlock', { name: dragSource.label })
            : dragSource.label}
        </span>
      </div>
    </div>
  );
}

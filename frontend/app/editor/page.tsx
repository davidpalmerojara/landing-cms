'use client';

import TopBar from '@/components/editor/TopBar';
import LeftSidebar from '@/components/editor/LeftSidebar';
import CanvasViewport from '@/components/editor/CanvasViewport';
import DragOverlay from '@/components/editor/DragOverlay';
import Inspector from '@/components/inspector/Inspector';
import { useEditorStore } from '@/store/editor-store';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useLocalPagePersistence } from '@/hooks/useLocalPagePersistence';
import { useDragManager } from '@/hooks/useDragManager';

export default function EditorPage() {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  useEditorShortcuts();
  useLocalPagePersistence();
  useDragManager();

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 font-sans text-zinc-300 overflow-hidden outline-none"
      tabIndex={0}
    >
      <TopBar />

      <main className="flex flex-1 overflow-hidden relative">
        {!isPreviewMode && <LeftSidebar />}
        <CanvasViewport />
        {!isPreviewMode && <Inspector />}
      </main>

      <DragOverlay />
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editor-store';

export function useEditorShortcuts() {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);

  useEffect(() => {
    if (isPreviewMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && !isTyping) {
        const key = e.key.toLowerCase();

        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            useEditorStore.getState().redo();
          } else {
            useEditorStore.getState().undo();
          }
          return;
        }

        if (key === 'y') {
          e.preventDefault();
          useEditorStore.getState().redo();
          return;
        }

        if (key === 'c') {
          e.preventDefault();
          useEditorStore.getState().copy();
          return;
        }

        if (key === 'v') {
          e.preventDefault();
          useEditorStore.getState().paste();
          return;
        }
      }

      if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace')) {
        const { selectedBlockId } = useEditorStore.getState();
        if (selectedBlockId) {
          e.preventDefault();
          useEditorStore.getState().deleteBlock(selectedBlockId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewMode]);
}

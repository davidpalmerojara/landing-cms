'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { isKeyOperableTarget, isMacPlatform, isTextEntryTarget } from '@/lib/keyboard';

export function useEditorShortcuts() {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);

  useEffect(() => {
    if (isPreviewMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Fields (also contentEditable and selects) keep their own keys
      const isTyping = isTextEntryTarget(e.target);
      const cmdOrCtrl = isMacPlatform() ? e.metaKey : e.ctrlKey;

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

      // Backspace on a focused button or link must not delete a block by surprise
      const isOperating = isKeyOperableTarget(e.target);
      if (!isOperating && (e.key === 'Delete' || e.key === 'Backspace')) {
        const { selectedBlockId } = useEditorStore.getState();
        if (selectedBlockId) {
          e.preventDefault();
          useEditorStore.getState().requestDeleteBlock(selectedBlockId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewMode]);
}

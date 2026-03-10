'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';

const STORAGE_KEY = 'landing_builder_page';

export function useLocalPagePersistence() {
  const page = useEditorStore((s) => s.page);
  const setPageWithHistory = useEditorStore((s) => s.setPageWithHistory);
  const hasLoadedRef = useRef(false);

  // Load from localStorage on mount (only once)
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.blocks) {
          // Set page directly without pushing to history
          useEditorStore.setState({ page: parsed });
        }
      }
    } catch (e) {
      console.error('Error loading page from localStorage:', e);
    }
  }, [setPageWithHistory]);

  // Save to localStorage on every page change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(page));
  }, [page]);
}

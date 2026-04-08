'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'paxl-theme';

function getThemeSnapshot(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function subscribeToTheme(callback: () => void): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
        callback();
        return;
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function applyTheme(mode: ThemeMode) {
  if (mode === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark');

  const setTheme = useCallback((mode: ThemeMode) => {
    applyTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = getThemeSnapshot() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }, []);

  return { theme, setTheme, toggleTheme };
}

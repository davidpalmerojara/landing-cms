'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const t = useTranslations('preferences');
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
      // 44 px on touch screens, compact with a mouse
      className={`flex items-center justify-center p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-card transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${className ?? ''}`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

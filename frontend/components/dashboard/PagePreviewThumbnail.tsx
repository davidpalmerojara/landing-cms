'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { blockRegistry } from '@/lib/block-registry';
import { getThemeById } from '@/lib/themes';
import type { ApiPreviewBlock } from '@/lib/api';

const VIRTUAL_WIDTH = 1280;

interface PagePreviewThumbnailProps {
  blocks: ApiPreviewBlock[];
  themeId?: string;
}

export default function PagePreviewThumbnail({ blocks, themeId }: PagePreviewThumbnailProps) {
  const t = useTranslations('preview');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / VIRTUAL_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const themeVars = useMemo(() => {
    const theme = getThemeById(themeId || 'default');
    return {
      '--theme-primary': theme.colors.primary,
      '--theme-primary-hover': theme.colors.primaryHover,
      '--theme-secondary': theme.colors.secondary,
      '--theme-bg': theme.colors.background,
      '--theme-surface': theme.colors.surface,
      '--theme-text': theme.colors.text,
      '--theme-text-muted': theme.colors.textMuted,
      '--theme-border': theme.colors.border,
      '--theme-accent': theme.colors.accent,
    } as React.CSSProperties;
  }, [themeId]);

  if (blocks.length === 0) {
    return (
      <div className="h-full min-h-36 bg-surface-elevated flex items-center justify-center">
        <span className="text-xs text-muted">{t('empty')}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full min-h-36 bg-white overflow-hidden relative"
    >
      {scale > 0 && (
        <div
          inert
          className="origin-top-left pointer-events-none select-none"
          style={{
            width: `${VIRTUAL_WIDTH}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            ...themeVars,
          }}
        >
          {blocks.map((block) => {
            const BlockComponent = blockRegistry[block.type]?.component;
            if (!BlockComponent) return null;

            return (
              <div key={block.id} style={{ overflow: 'hidden' }}>
                <BlockComponent
                  blockId={block.id}
                  data={block.data}
                  isMobile={false}
                  isTablet={false}
                  isPreviewMode={true}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* Fade out at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface-card/90 to-transparent" />
    </div>
  );
}

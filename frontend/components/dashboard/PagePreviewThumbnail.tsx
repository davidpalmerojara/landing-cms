'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { UntypedBlockContent } from '@/components/blocks/BlockContent';
import { isBlockType } from '@/lib/block-data';
import { pageThemeVars } from '@/lib/page-theme';
import type { DesignTokens } from '@/lib/design-tokens';
import type { ApiPreviewBlock } from '@/lib/api';

const VIRTUAL_WIDTH = 1280;

interface PagePreviewThumbnailProps {
  blocks: ApiPreviewBlock[];
  designTokens: DesignTokens;
}

export default function PagePreviewThumbnail({ blocks, designTokens }: PagePreviewThumbnailProps) {
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

  const themeVars = useMemo(() => pageThemeVars(designTokens), [designTokens]);

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
          className="@container origin-top-left pointer-events-none select-none"
          style={{
            width: `${VIRTUAL_WIDTH}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            ...themeVars,
          }}
        >
          {blocks.map((block) => {
            if (!isBlockType(block.type)) return null;

            return (
              <div key={block.id} style={{ overflow: 'hidden' }}>
                <UntypedBlockContent block={block} isPreviewMode={true} />
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

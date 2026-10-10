'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { resolveStyles } from '@/types/blocks';
import type { Page } from '@/types/page';
import BlockContent from '@/components/blocks/BlockContent';
import { pageThemeVars } from '@/lib/page-theme';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';

/** The page full screen, as a phone visitor sees it, with a bar to go back to editing. */
export default function MobilePreview({ page, onBack }: { page: Page; onBack: () => void }) {
  const t = useTranslations();
  const [showBar, setShowBar] = useState(true);
  // The phone's back button returns to the editor (QA-066)
  useCloseOnBack(true, onBack);

  const themeVars = pageThemeVars(page.designTokens);

  return (
    <div className="fixed inset-0 z-80 bg-white">
      <div
        className="@container h-full overflow-y-auto"
        style={themeVars}
        onClick={(e) => {
          // Only toggle bar when clicking empty areas, not interactive block elements
          const target = e.target as HTMLElement;
          if (!target.closest('button, a, input, select, textarea, [role="button"]')) {
            setShowBar((v) => !v);
          }
        }}
      >
        {page.blocks.map((block) => {
          // Apply block-level styles (padding, margin, bgColor, borderRadius)
          const s = resolveStyles(block, 'mobile');
          const needsOverflow = block.type === 'navbar';
          const blockStyle: React.CSSProperties = needsOverflow ? {} : { overflow: 'hidden' };
          if (s.paddingTop) blockStyle.paddingTop = s.paddingTop;
          if (s.paddingBottom) blockStyle.paddingBottom = s.paddingBottom;
          if (s.paddingLeft) blockStyle.paddingLeft = s.paddingLeft;
          if (s.paddingRight) blockStyle.paddingRight = s.paddingRight;
          if (s.marginTop) blockStyle.marginTop = s.marginTop;
          if (s.marginBottom) blockStyle.marginBottom = s.marginBottom;
          if (s.bgColor) {
            blockStyle.backgroundColor = s.bgColor;
            (blockStyle as Record<string, unknown>)['--theme-bg'] = s.bgColor;
          }
          if (s.borderRadius) blockStyle.borderRadius = s.borderRadius;

          return (
            <div key={block.id} style={blockStyle}>
              <BlockContent block={block} isPreviewMode={true} />
            </div>
          );
        })}
        {/* Room to scroll the end of the page out from under the bar */}
        {showBar && <div className="h-24" aria-hidden="true" />}
      </div>

      {showBar && (
        // Opaque, and above the home indicator (QA-111)
        <div className="fixed left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-90 flex items-center justify-between gap-3 pl-2 pr-4 bg-surface-card rounded-2xl border border-default/30 shadow-2xl shadow-black/40">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="flex items-center gap-2 px-2 text-sm font-semibold text-primary active:opacity-70 min-h-12"
          >
            <ArrowLeft size={18} aria-hidden="true" /> {t('mobile.backToEditor')}
          </button>
          <span className="text-[13px] text-secondary">{t('mobile.previewLabel')}</span>
        </div>
      )}
    </div>
  );
}

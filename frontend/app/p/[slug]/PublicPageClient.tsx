'use client';

import { useSyncExternalStore } from 'react';
import Script from 'next/script';
import { useTranslations } from 'next-intl';
import { blockRegistry } from '@/lib/block-registry';
import { defaultBlockStyles, resolveStyles } from '@/types/blocks';
import type { Block } from '@/types/blocks';
import { getThemeById } from '@/lib/themes';
import { apiToTokens, defaultDesignTokens, tokensToCssVars, tokensToThemeVars } from '@/lib/design-tokens';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const emptySubscribe = () => () => {};

function getDeviceModeSnapshot(): DeviceMode {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function subscribeToViewport(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

interface ApiBlock {
  id: string;
  type: string;
  order: number;
  data: Record<string, unknown>;
  styles: Record<string, unknown>;
}

interface ApiPage {
  id: string;
  name: string;
  slug: string;
  status: string;
  theme_id?: string;
  custom_theme?: Record<string, string> | null;
  design_tokens?: Record<string, unknown> | null;
  blocks: ApiBlock[];
  show_watermark?: boolean;
}

function mapBlocks(apiBlocks: ApiBlock[]): Block[] {
  return apiBlocks
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const { responsive, ...baseStyles } = b.styles as Record<string, unknown>;
      return {
        id: b.id,
        type: b.type,
        name: blockRegistry[b.type]?.label || b.type,
        data: b.data,
        styles: { ...defaultBlockStyles, ...baseStyles },
        responsiveStyles: (responsive as Block['responsiveStyles']) || undefined,
      };
    });
}

export default function PublicPageClient({ page }: { page: ApiPage }) {
  const t = useTranslations();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const deviceMode = useSyncExternalStore<DeviceMode>(
    subscribeToViewport,
    getDeviceModeSnapshot,
    () => 'desktop',
  );

  const blocks = mapBlocks(page.blocks);
  const themeId = page.theme_id || 'default';
  const customColors = page.custom_theme as import('@/lib/themes').ThemeColors | undefined;
  const theme = getThemeById(themeId, customColors || undefined);
  const designTokens = apiToTokens(page.design_tokens as Record<string, unknown> | undefined) || defaultDesignTokens;
  const bpVars = tokensToCssVars(designTokens);
  const legacyVars = page.design_tokens ? tokensToThemeVars(designTokens) : {
    '--theme-primary': theme.colors.primary,
    '--theme-primary-hover': theme.colors.primaryHover,
    '--theme-secondary': theme.colors.secondary,
    '--theme-bg': theme.colors.background,
    '--theme-surface': theme.colors.surface,
    '--theme-text': theme.colors.text,
    '--theme-text-muted': theme.colors.textMuted,
    '--theme-border': theme.colors.border,
    '--theme-accent': theme.colors.accent,
  };
  const themeVars = { ...bpVars, ...legacyVars } as React.CSSProperties;

  if (!mounted) {
    return <div className="min-h-screen bg-white" style={themeVars} />;
  }

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-white text-muted">
        <p className="text-xl">{t('publicPage.empty')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={themeVars}>
      {blocks.map((block) => {
        const BlockComponent = blockRegistry[block.type]?.component;
        if (!BlockComponent) return null;

        const s = resolveStyles(block, deviceMode);
        const blockStyle: React.CSSProperties = block.type !== 'navbar' ? { overflow: 'hidden' } : {};
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
          <div key={block.id} data-block-id={block.id} data-block-type={block.type} style={blockStyle}>
            <BlockComponent
              blockId={block.id}
              data={block.data}
              isMobile={deviceMode === 'mobile'}
              isTablet={deviceMode === 'tablet'}
              isPreviewMode={true}
            />
          </div>
        );
      })}

      <Script
        src="/bp-analytics.js"
        strategy="afterInteractive"
        data-page-id={page.id}
        data-api-url={API_BASE}
      />

      {page.show_watermark && (
        <div className="fixed bottom-4 right-4 z-50">
          <a
            href="https://paxl.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-surface-elevated/90 backdrop-blur-sm text-muted hover:text-primary text-xs px-3 py-1.5 rounded-full shadow-lg border border-subtle/50 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 5h5l-4 3 2 5-5-4-5 4 2-5-4-3h5z" fill="currentColor"/></svg>
            {t('publicPage.madeWith')}
          </a>
        </div>
      )}
    </div>
  );
}

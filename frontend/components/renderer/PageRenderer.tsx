'use client';

import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import type { Block } from '@/types/blocks';
import BlockContent from '@/components/blocks/BlockContent';
import { blockAnchorIds } from '@/lib/block-anchors';
import { blockStyleClass, blockStylesCss } from '@/lib/block-styles-css';
import { ContactFormProvider } from '@/components/blocks/contact-form-context';
import { LiveLinksProvider } from '@/components/blocks/live-links-context';

interface PageRendererProps {
  blocks: Block[];
  /** CSS variables of the page theme (pageThemeVars) */
  themeVars: CSSProperties;
  /** Links navigate: the public page and the standalone preview */
  liveLinks?: boolean;
  /** Slug of the published page; lets the contact form send */
  contactSlug?: string;
  className?: string;
  /** Rendered after the blocks, inside the themed area */
  children?: ReactNode;
}

/**
 * A page as visitors see it, shared by the public page and the preview.
 *
 * It renders on the server: nothing depends on the window. The root is a
 * size container, so blocks pick their layout with @tablet: / @desktop:
 * container variants and per-device spacing comes from a stylesheet built
 * from the block styles (blockStylesCss).
 */
const PageRenderer = ({ blocks, themeVars, liveLinks = false, contactSlug, className, children }: PageRendererProps) => {
  const anchorIds = blockAnchorIds(blocks);
  const css = blockStylesCss(blocks);

  return (
    <LiveLinksProvider value={liveLinks}>
      <ContactFormProvider value={{ slug: contactSlug ?? null }}>
        <div className={clsx('@container min-h-screen bg-white', className)} style={themeVars}>
          {/* Only numbers, plain colours and validated ids reach this string */}
          {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
          {blocks.map((block) => (
            <div
              key={block.id}
              id={anchorIds.get(block.id)}
              className={blockStyleClass(block.id) ?? undefined}
              data-block-id={block.id}
              data-block-type={block.type}
              style={block.type !== 'navbar' ? { overflow: 'hidden' } : undefined}
            >
              <BlockContent block={block} isPreviewMode={true} />
            </div>
          ))}
          {children}
        </div>
      </ContactFormProvider>
    </LiveLinksProvider>
  );
};

export default PageRenderer;

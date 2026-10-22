'use client';

import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { NextIntlClientProvider } from 'next-intl';
import type { Block } from '@/types/blocks';
import BlockContent from '@/components/blocks/BlockContent';
import { blockAnchorIds } from '@/lib/block-anchors';
import { blockStyleClass, blockStylesCss } from '@/lib/block-styles-css';
import { MESSAGES } from '@/lib/i18n';
import { pageMessagesLocale } from '@/lib/page-language';
import { ContactFormProvider } from '@/components/blocks/contact-form-context';
import { LiveLinksProvider } from '@/components/blocks/live-links-context';
import { EAGER_IMAGE_BLOCKS, ImagePriorityProvider } from '@/components/blocks/image-priority-context';

interface PageRendererProps {
  blocks: Block[];
  /** CSS variables of the page theme (pageThemeVars) */
  themeVars: CSSProperties;
  /** Language the page is written in (Page.language): its `lang`, and the words Paxl puts in its blocks */
  language?: string;
  /** Links navigate: the public page and the standalone preview */
  liveLinks?: boolean;
  /** Slug of the published page; lets the contact form send */
  contactSlug?: string;
  /** A guest's published page: the contact form explains it doesn't send */
  guestPage?: boolean;
  /** Published by an account whose email is not verified yet: the form explains it doesn't send (ADR-052) */
  unverifiedPage?: boolean;
  className?: string;
}

/**
 * Index of the block that closes the page after <main>: the last block when it
 * is a footer; the page length otherwise. Only that one is the page's
 * contentinfo landmark: any other footer stays in <main>, where it is not one
 * (two contentinfo landmarks would be announced twice, PUBLIC3-002).
 */
function closingFooterIndex(blocks: Block[]): number {
  const last = blocks.length - 1;
  // A page of one footer keeps it in <main>: the skip link needs somewhere to land
  return last > 0 && blocks[last].type === 'footer' ? last : blocks.length;
}

/**
 * A page as visitors see it, shared by the public page and the preview.
 *
 * It renders on the server: nothing depends on the window. The root is a
 * size container, so blocks pick their layout with @tablet: / @desktop:
 * container variants and per-device spacing comes from a stylesheet built
 * from the block styles (blockStylesCss).
 *
 * <main> (the skip link's target, QA-090) holds the blocks; a footer that is the
 * last block sits after it, so it is the contentinfo landmark. The root
 * is its own stacking context: nothing a block draws can cover what Paxl shows
 * around the page (the guest notice, the watermark).
 */
const PageRenderer = ({
  blocks, themeVars, language, liveLinks = false, contactSlug, guestPage = false, unverifiedPage = false, className,
}: PageRendererProps) => {
  const anchorIds = blockAnchorIds(blocks);
  const css = blockStylesCss(blocks);
  const messagesLocale = pageMessagesLocale(language);

  // A closing footer is the page's contentinfo landmark: inside <main> it would not be one (PUBLIC2-005)
  const closingFooterStart = closingFooterIndex(blocks);

  const renderBlock = (block: Block, index: number) => (
    <div
      key={block.id}
      id={anchorIds.get(block.id)}
      className={blockStyleClass(block.id) ?? undefined}
      data-block-id={block.id}
      data-block-type={block.type}
      style={block.type !== 'navbar' ? { overflow: 'hidden' } : undefined}
    >
      {/* Images of the first blocks load at once; the rest when they near the screen (PERF-002) */}
      <ImagePriorityProvider eager={index < EAGER_IMAGE_BLOCKS}>
        <BlockContent block={block} isPreviewMode={true} />
      </ImagePriorityProvider>
    </div>
  );
  const mainContent = blocks.slice(0, closingFooterStart).map((block, index) => renderBlock(block, index));
  const closingContent = blocks.slice(closingFooterStart).map((block, index) => renderBlock(block, closingFooterStart + index));
  const withMessages = (content: ReactNode) => (messagesLocale ? (
    // Landmark names, "Popular", form labels: in the page's language, not the visitor's (QA-091)
    <NextIntlClientProvider locale={messagesLocale} messages={MESSAGES[messagesLocale]} timeZone="Europe/Madrid">
      {content}
    </NextIntlClientProvider>
  ) : content);

  return (
    <LiveLinksProvider value={liveLinks}>
      <ContactFormProvider value={{ slug: contactSlug ?? null, guestPage, unverifiedPage }}>
        <div
          lang={language}
          className={clsx('@container isolate min-h-screen', className)}
          style={{ ...themeVars, backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
        >
          {/* Only numbers, plain colours and validated ids reach this string */}
          {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
          <main id="main-content" tabIndex={-1} className="outline-none">
            {withMessages(mainContent)}
          </main>
          {closingContent.length > 0 && withMessages(closingContent)}
        </div>
      </ContactFormProvider>
    </LiveLinksProvider>
  );
};

export default PageRenderer;

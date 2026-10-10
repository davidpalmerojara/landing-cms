'use client';

import type { CSSProperties } from 'react';
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
  className?: string;
}

/**
 * A page as visitors see it, shared by the public page and the preview.
 *
 * It renders on the server: nothing depends on the window. The root is a
 * size container, so blocks pick their layout with @tablet: / @desktop:
 * container variants and per-device spacing comes from a stylesheet built
 * from the block styles (blockStylesCss).
 *
 * The root is the document's main landmark (the skip link's target, QA-090)
 * and its own stacking context: nothing a block draws can cover what Paxl
 * shows around the page (the guest notice, the watermark).
 */
const PageRenderer = ({ blocks, themeVars, language, liveLinks = false, contactSlug, guestPage = false, className }: PageRendererProps) => {
  const anchorIds = blockAnchorIds(blocks);
  const css = blockStylesCss(blocks);
  const messagesLocale = pageMessagesLocale(language);

  const content = blocks.map((block) => (
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
  ));

  return (
    <LiveLinksProvider value={liveLinks}>
      <ContactFormProvider value={{ slug: contactSlug ?? null, guestPage }}>
        <main
          id="main-content"
          tabIndex={-1}
          lang={language}
          className={clsx('@container isolate min-h-screen outline-none', className)}
          style={{ ...themeVars, backgroundColor: 'var(--theme-bg)', color: 'var(--theme-text)' }}
        >
          {/* Only numbers, plain colours and validated ids reach this string */}
          {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
          {messagesLocale ? (
            // Landmark names, "Popular", form labels: in the page's language, not the visitor's (QA-091)
            <NextIntlClientProvider locale={messagesLocale} messages={MESSAGES[messagesLocale]} timeZone="Europe/Madrid">
              {content}
            </NextIntlClientProvider>
          ) : content}
        </main>
      </ContactFormProvider>
    </LiveLinksProvider>
  );
};

export default PageRenderer;

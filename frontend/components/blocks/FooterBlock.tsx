'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';
import BlockLink from './BlockLink';
import { safeHref } from '@/lib/safe-link';

export default function FooterBlock({ blockId, data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const footerLinkClass = 'hover:text-white active:text-white cursor-pointer transition-colors text-sm font-medium';
  const footerLinks = (['link1', 'link2', 'link3'] as const).map((key) => ({
    key,
    label: data[`${key}Label`] as string,
    href: isPreviewMode ? safeHref(data[`${key}Url`]) : null,
  }));

  return (
    <footer
      aria-label={t('footerAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-12 px-6 @tablet:py-16 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-text)', color: 'var(--theme-text-muted)' }}
    >
      <div
        className="max-w-5xl mx-auto flex transition-all flex-col gap-8 text-center @tablet:flex-row @tablet:justify-between @tablet:items-center @tablet:gap-0 @tablet:text-left mb-12"
      >
        <div className="w-full @tablet:w-auto @tablet:max-w-sm">
          <div className="flex items-center justify-center @tablet:justify-start gap-2 mb-4">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-white"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              <Sparkles className="w-3 h-3" />
            </div>
            <EditableText
              blockId={blockId}
              fieldKey="brandName"
              value={data.brandName as string}
              as="h3"
              className="text-xl font-bold tracking-wide"
              style={{ color: 'var(--theme-bg)' }}
            />
          </div>
          <EditableText
            blockId={blockId}
            fieldKey="description"
            value={data.description as string}
            as="p"
            multiline
            className="leading-relaxed text-sm"
            style={{ color: 'var(--theme-text-muted)' }}
          />
        </div>
        <div
          className="flex gap-6 justify-center w-full flex-wrap @tablet:w-auto @tablet:flex-nowrap @tablet:justify-start"
        >
          {footerLinks.map(({ key, label, href }) =>
            href ? (
              <BlockLink key={key} href={href} className={footerLinkClass}>
                {label}
              </BlockLink>
            ) : (
              <EditableText
                key={key}
                blockId={blockId}
                fieldKey={`${key}Label`}
                value={label}
                className={footerLinkClass}
              />
            ),
          )}
        </div>
      </div>
      <div
        className="max-w-5xl mx-auto pt-8 border-t text-sm text-center"
        style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-muted)' }}
      >
        <EditableText blockId={blockId} fieldKey="copyright" value={data.copyright as string} />
      </div>
    </footer>
  );
}

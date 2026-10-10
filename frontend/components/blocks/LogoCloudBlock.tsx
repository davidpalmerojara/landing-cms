'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, LogoCloudData } from '@/types/blocks';
import EditableText from './EditableText';

export default function LogoCloudBlock({ blockId, data, isPreviewMode }: BlockProps<LogoCloudData>) {
  const t = useTranslations('blocks');
  const hasLogos = data.logos.some((logo) => logo.name);

  return (
    <section
      aria-label={t('logoCloudAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-12 px-6 @tablet:py-16 @tablet:px-8`}
      style={{ backgroundColor: 'var(--block-bg, var(--theme-surface))' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title}
        as="p"
        className="text-center text-sm mb-8 uppercase tracking-widest font-medium"
        style={{ color: 'var(--theme-text-muted)' }}
      />
      {hasLogos && (
        <div
          className="flex items-center justify-center gap-8 max-w-4xl mx-auto flex-wrap @tablet:gap-12"
        >
          {data.logos.map((logo, index) => {
            // Logos left empty are not shown
            if (!logo.name) return null;
            return (
              <EditableText
                key={index}
                blockId={blockId}
                fieldKey={['logos', index, 'name']}
                value={logo.name}
                className="font-bold text-lg @tablet:text-xl"
                style={{ color: 'var(--theme-text-muted)' }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

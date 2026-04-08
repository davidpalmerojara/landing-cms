'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function LogoCloudBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const logoKeys = ['logo1', 'logo2', 'logo3', 'logo4', 'logo5'] as const;

  return (
    <section
      aria-label={t('logoCloudAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-12 px-6' : 'py-16 px-8'}`}
      style={{ backgroundColor: 'var(--theme-surface)' }}
    >
      <EditableText
        blockId={blockId}
        fieldKey="title"
        value={data.title as string}
        as="p"
        className="text-center text-sm mb-8 uppercase tracking-widest font-medium"
        style={{ color: 'var(--theme-text-muted)' }}
      />
      <div
        className={`flex items-center justify-center gap-8 max-w-4xl mx-auto flex-wrap ${
          isMobile ? 'gap-6' : 'gap-12'
        }`}
      >
        {logoKeys.map((key) => {
          const name = data[key] as string;
          if (!name) return null;
          return (
            <EditableText
              key={key}
              blockId={blockId}
              fieldKey={key}
              value={name}
              className={`font-bold opacity-60 ${
                isMobile ? 'text-lg' : 'text-xl'
              }`}
              style={{ color: 'var(--theme-text-muted)' }}
            />
          );
        })}
      </div>
    </section>
  );
}

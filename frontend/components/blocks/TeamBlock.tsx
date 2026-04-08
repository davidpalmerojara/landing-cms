'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';
import EditableText from './EditableText';

export default function TeamBlock({ blockId, data, isMobile, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const member1Image = data.member1Image as string;
  const member2Image = data.member2Image as string;
  const member3Image = data.member3Image as string;

  const members = [
    { nameKey: 'member1Name', roleKey: 'member1Role', image: member1Image },
    { nameKey: 'member2Name', roleKey: 'member2Role', image: member2Image },
    { nameKey: 'member3Name', roleKey: 'member3Role', image: member3Image },
  ];

  return (
    <section
      aria-label={t('teamAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } ${isMobile ? 'py-16 px-6' : 'py-24 px-8'}`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <div className="max-w-5xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title as string}
          as="h2"
          className={`text-center mb-4 transition-all ${
            isMobile ? 'text-3xl' : 'text-4xl'
          }`}
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle as string}
          as="p"
          multiline
          className={`text-center max-w-2xl mx-auto mb-12 ${
            isMobile ? 'text-base' : 'text-lg'
          }`}
          style={{ color: 'var(--theme-text-muted)' }}
        />
        <div className={`grid gap-8 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {members.map((m) => (
            <div key={m.nameKey} className="flex flex-col items-center text-center">
              {m.image ? (
                <img
                  src={m.image}
                  alt={(data[m.nameKey] as string) || t('teamMemberAlt')}
                  className="w-24 h-24 rounded-full object-cover mb-4 border-2"
                  style={{ borderColor: 'var(--theme-border)' }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full mb-4 flex items-center justify-center text-2xl font-bold"
                  style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-muted)' }}
                >
                  {(data[m.nameKey] as string)?.charAt(0) || '?'}
                </div>
              )}
              <EditableText
                blockId={blockId}
                fieldKey={m.nameKey}
                value={data[m.nameKey] as string}
                as="h3"
                className="font-semibold text-lg"
                style={{ color: 'var(--theme-text)' }}
              />
              <EditableText
                blockId={blockId}
                fieldKey={m.roleKey}
                value={data[m.roleKey] as string}
                as="p"
                className="text-sm mt-1"
                style={{ color: 'var(--theme-text-muted)' }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

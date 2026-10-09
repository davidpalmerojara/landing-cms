'use client';

import { useTranslations } from 'next-intl';
import type { BlockProps, TeamData } from '@/types/blocks';
import EditableText from './EditableText';

export default function TeamBlock({ blockId, data, isPreviewMode }: BlockProps<TeamData>) {
  const t = useTranslations('blocks');

  return (
    <section
      aria-label={t('teamAria')}
      className={`transition-all ${
        isPreviewMode ? '' : 'pointer-events-none'
      } py-16 px-6 @tablet:py-24 @tablet:px-8`}
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <div className="max-w-5xl mx-auto">
        <EditableText
          blockId={blockId}
          fieldKey="title"
          value={data.title}
          as="h2"
          className="text-center mb-4 transition-all text-3xl @tablet:text-4xl"
          style={{ color: 'var(--theme-text)', fontFamily: 'var(--bp-font-heading)', fontWeight: 'var(--bp-font-weight-heading)' as unknown as number }}
        />
        <EditableText
          blockId={blockId}
          fieldKey="subtitle"
          value={data.subtitle}
          as="p"
          multiline
          className="text-center max-w-2xl mx-auto mb-12 text-base @tablet:text-lg"
          style={{ color: 'var(--theme-text-muted)' }}
        />
        {data.members.length > 0 && (
          <div className="grid gap-8 grid-cols-1 @tablet:grid-cols-3">
            {data.members.map((member, index) => (
              <div key={index} className="flex flex-col items-center text-center">
                {member.image ? (
                  <img
                    src={member.image}
                    alt={member.name || t('teamMemberAlt')}
                    className="w-24 h-24 rounded-full object-cover mb-4 border-2"
                    style={{ borderColor: 'var(--theme-border)' }}
                  />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full mb-4 flex items-center justify-center text-2xl font-bold"
                    style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-muted)' }}
                  >
                    {member.name.charAt(0) || '?'}
                  </div>
                )}
                <EditableText
                  blockId={blockId}
                  fieldKey={['members', index, 'name']}
                  value={member.name}
                  as="h3"
                  className="font-semibold text-lg"
                  style={{ color: 'var(--theme-text)' }}
                />
                <EditableText
                  blockId={blockId}
                  fieldKey={['members', index, 'role']}
                  value={member.role}
                  as="p"
                  className="text-sm mt-1"
                  style={{ color: 'var(--theme-text-muted)' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

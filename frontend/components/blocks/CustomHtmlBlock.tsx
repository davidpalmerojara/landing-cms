'use client';

import { Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BlockProps } from '@/types/blocks';

export default function CustomHtmlBlock({ data, isPreviewMode }: BlockProps) {
  const t = useTranslations('blocks');
  const html = (data.html as string) || '';

  if (isPreviewMode && html) {
    return (
      <div
        className="w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="bg-zinc-50 py-12 px-8 pointer-events-none">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Code2 className="w-5 h-5 text-muted" />
          <span className="text-sm font-medium text-secondary">{t('customHtmlTitle')}</span>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 border border-subtle">
          <pre className="text-[12px] text-muted font-mono whitespace-pre-wrap break-all max-h-40 overflow-hidden">
            {html || t('customHtmlEmpty')}
          </pre>
        </div>
      </div>
    </div>
  );
}

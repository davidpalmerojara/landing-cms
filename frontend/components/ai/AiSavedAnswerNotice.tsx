'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { savedAnswerLabelKeys, type AiAnswerKind } from '@/lib/ai';
import type { AiDemoInfo, AiSource } from '@/lib/api';

interface AiSavedAnswerNoticeProps {
  kind: AiAnswerKind;
  source: AiSource;
  demo?: AiDemoInfo;
}

/** Says plainly that an answer is a saved one (demo mode, daily limit or no quota), and why. Renders nothing for real answers. */
export default function AiSavedAnswerNotice({ kind, source, demo }: AiSavedAnswerNoticeProps) {
  const t = useTranslations();
  const keys = savedAnswerLabelKeys(kind, source, demo);
  if (keys.length === 0) return null;

  return (
    <div role="status" className="flex items-start gap-2 text-sm text-secondary bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary-color" aria-hidden="true" />
      <div className="space-y-1">
        {keys.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
      </div>
    </div>
  );
}

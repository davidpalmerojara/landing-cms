'use client';

import { useTranslations } from 'next-intl';
import { modeNoticeKey } from '@/lib/ai';
import type { AiOptions } from '@/lib/api';

interface AiModeNoticeProps {
  id?: string;
  mode: AiOptions['mode'] | null;
  /** Set while the user has typed their own key: their text goes to that provider */
  ownKeyProvider: 'gemini' | 'anthropic' | null;
  liveUserDailyLimit: number;
}

/** Short note next to the input: what happens to what is typed. Never asks for or shows personal data. */
export default function AiModeNotice({ id, mode, ownKeyProvider, liveUserDailyLimit }: AiModeNoticeProps) {
  const t = useTranslations();
  const key = modeNoticeKey(mode, ownKeyProvider);
  if (!key) return null;

  return (
    <p id={id} className="text-xs text-muted">
      {t(key, { count: liveUserDailyLimit })}
    </p>
  );
}

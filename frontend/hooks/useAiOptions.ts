'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AiOptions } from '@/lib/api';

/** How AI answers right now (demo, live or only with your own key) and the saved prompt suggestions. */
export function useAiOptions(language: 'es' | 'en', enabled = true) {
  const [options, setOptions] = useState<AiOptions | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.ai.options(language)
      .then((res) => {
        if (!cancelled) setOptions(res);
      })
      .catch((e: unknown) => {
        // The suggestions are optional: without them the form still works
        if (process.env.NODE_ENV === 'development') console.error('AI options unavailable:', e);
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [language, enabled]);

  return { options, error };
}

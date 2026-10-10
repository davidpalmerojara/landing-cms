'use client';

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { AiDemoInfo, AiSource } from '@/lib/api';
import { aiErrorText, parseApiError } from '@/lib/ai';
import { flushPendingSave } from '@/lib/save-flush';
import { useAiOptions } from '@/hooks/useAiOptions';
import { useEditorStore } from '@/store/editor-store';
import type { AiProvider } from '@/components/ai/AiKeyFields';

export interface AiSavedResult {
  source: AiSource;
  demo?: AiDemoInfo;
}

/**
 * Rewrite one block with AI (POST /pages/{id}/blocks/{bid}/edit-ai/), the same
 * flow as the canvas popover: the pending save goes first (the server edits
 * its copy), the answer replaces the block's data as one undo step, and a
 * saved demo variant says so instead of pretending it followed the
 * instruction. Used by Quick Edit's "Mejorar con IA" (QA-067).
 */
export function useAiBlockEdit(pageId: string, blockId: string, enabled = true) {
  const t = useTranslations();
  const locale = useLocale();
  const replaceBlockData = useEditorStore((s) => s.replaceBlockData);
  const { options, error: optionsError } = useAiOptions(locale === 'en' ? 'en' : 'es', enabled);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<AiSavedResult | null>(null);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const ownKey = apiKey.trim();
  // Without their own key, in demo mode the instruction cannot be followed
  const demoEditsAhead = options?.mode === 'demo' && !ownKey;
  // Wait for the mode so the chips do not flash and vanish; without it (request failed) show them
  const showSuggestions = (options !== null || optionsError !== null) && !demoEditsAhead;
  const suggestions = [
    t('ai.blockSuggestion1'),
    t('ai.blockSuggestion2'),
    t('ai.blockSuggestion3'),
    t('ai.blockSuggestion4'),
    t('ai.blockSuggestion5'),
  ];

  /** Resolves true when the block now has the AI's answer and nothing more is to be shown. */
  const submit = useCallback(async (instruction: string): Promise<boolean> => {
    const value = instruction.trim();
    if (!value || isLoading) return false;
    setIsLoading(true);
    setError(null);
    setSavedResult(null);
    try {
      if (!(await flushPendingSave())) {
        setError(t('saveStatus.aiNeedsSave'));
        return false;
      }
      const result = await api.ai.editBlock(
        pageId,
        blockId,
        value,
        ownKey ? { provider, api_key: ownKey } : undefined,
      );
      if (!replaceBlockData(blockId, result.block.type, result.block.data)) {
        // The server answered with a block type this editor does not know
        setError(t('ai.blockEditError'));
        return false;
      }
      if (result.source === 'demo') {
        setSavedResult({ source: result.source, demo: result.demo });
        return false;
      }
      return true;
    } catch (e) {
      const { message, code } = parseApiError(e, t('ai.blockEditError'));
      setError(aiErrorText({ message, code }, t, t('ai.blockEditError')));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [blockId, isLoading, ownKey, pageId, provider, replaceBlockData, t]);

  const reset = useCallback(() => {
    setError(null);
    setSavedResult(null);
  }, []);

  return {
    submit,
    reset,
    isLoading,
    error,
    savedResult,
    demoEditsAhead,
    showSuggestions,
    suggestions,
    provider,
    setProvider,
    apiKey,
    setApiKey,
  };
}

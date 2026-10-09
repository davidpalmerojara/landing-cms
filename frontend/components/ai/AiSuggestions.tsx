'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { AiPromptSuggestion } from '@/lib/api';

interface AiSuggestionsProps {
  prompts: AiPromptSuggestion[];
  onPick: (suggestion: AiPromptSuggestion) => void;
  disabled?: boolean;
}

/** The saved prompts offered as one-tap examples. Picking one only fills the description. */
export default function AiSuggestions({ prompts, onPick, disabled = false }: AiSuggestionsProps) {
  const t = useTranslations();
  const labelId = useId();

  if (prompts.length === 0) return null;

  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-xs font-medium text-secondary mb-1.5">{t('ai.suggestionsLabel')}</p>
      <div className="flex flex-wrap gap-1.5">
        {prompts.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onPick(suggestion)}
            disabled={disabled}
            title={suggestion.prompt}
            className="text-xs px-3 min-h-11 md:min-h-8 rounded-full bg-surface-elevated border border-subtle text-secondary hover:text-primary hover:border-default transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
          >
            {suggestion.title}
          </button>
        ))}
      </div>
    </div>
  );
}

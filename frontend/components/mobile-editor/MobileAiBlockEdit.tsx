'use client';

import { useState } from 'react';
import { Key, Loader2, Send, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAiBlockEdit } from '@/hooks/useAiBlockEdit';
import AiKeyFields from '@/components/ai/AiKeyFields';
import AiSavedAnswerNotice from '@/components/ai/AiSavedAnswerNotice';

interface MobileAiBlockEditProps {
  pageId: string;
  blockId: string;
  /** The AI changed the block (or the user closed the panel) */
  onDone: () => void;
}

/** "Mejorar con IA" inside the block sheet: an instruction or a suggestion rewrites the block's texts (QA-067). */
export default function MobileAiBlockEdit({ pageId, blockId, onDone }: MobileAiBlockEditProps) {
  const t = useTranslations();
  const [instruction, setInstruction] = useState('');
  const [showKeySetup, setShowKeySetup] = useState(false);
  const ai = useAiBlockEdit(pageId, blockId);
  const instructionId = `mobile-ai-${blockId}`;
  const demoNoteId = `${instructionId}-demo`;

  const send = async (text: string) => {
    if (await ai.submit(text)) onDone();
  };

  return (
    <section aria-labelledby={`${instructionId}-title`} className="mx-5 my-4 p-4 rounded-2xl border border-violet-500/30 bg-surface-card space-y-3">
      <h3 id={`${instructionId}-title`} className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles size={16} className="text-violet-400" aria-hidden="true" />
        {t('ai.blockEditTitle')}
      </h3>

      {ai.demoEditsAhead && !ai.savedResult && (
        <p id={demoNoteId} className="text-xs text-secondary">{t('ai.saved.block.demo_mode')}</p>
      )}

      <div className="flex items-end gap-2">
        <label htmlFor={instructionId} className="sr-only">{t('ai.blockEditTitle')}</label>
        <textarea
          id={instructionId}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t('ai.blockEditPlaceholder')}
          aria-describedby={ai.demoEditsAhead ? demoNoteId : undefined}
          maxLength={500}
          rows={2}
          disabled={ai.isLoading}
          enterKeyHint="send"
          className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-surface-elevated border border-default/15 text-primary text-sm placeholder-muted focus:border-violet-500/50 outline-none resize-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send(instruction)}
          disabled={ai.isLoading || !instruction.trim()}
          aria-label={t('ai.blockEditSend')}
          className="shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-violet-600 text-white active:opacity-80 disabled:opacity-50"
        >
          {ai.isLoading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
        </button>
      </div>

      {ai.isLoading && (
        <p role="status" className="text-xs text-secondary flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          {t('ai.blockEditing')}
        </p>
      )}

      {ai.error && <p role="alert" className="text-sm text-error">{ai.error}</p>}

      {ai.savedResult && (
        <div className="space-y-2">
          <AiSavedAnswerNotice kind="block" source={ai.savedResult.source} demo={ai.savedResult.demo} />
          <button
            type="button"
            onClick={onDone}
            className="w-full min-h-11 rounded-xl bg-surface-elevated border border-default/15 text-sm font-medium text-primary active:opacity-80"
          >
            {t('common.close')}
          </button>
        </div>
      )}

      {!ai.isLoading && !ai.savedResult && ai.showSuggestions && (
        <div className="flex flex-wrap gap-2">
          {ai.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setInstruction(suggestion);
                void send(suggestion);
              }}
              className="min-h-11 px-3 rounded-full bg-surface-elevated border border-default/15 text-[13px] text-secondary active:text-primary"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {!ai.savedResult && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowKeySetup((open) => !open)}
            aria-expanded={showKeySetup}
            aria-controls={`${instructionId}-key`}
            disabled={ai.isLoading}
            className="min-h-11 flex items-center gap-1.5 text-[13px] text-primary-color underline disabled:opacity-50"
          >
            <Key size={14} aria-hidden="true" />
            {t('ai.setupKey')}
          </button>
          {showKeySetup && (
            <div id={`${instructionId}-key`}>
              <AiKeyFields
                provider={ai.provider}
                onProviderChange={ai.setProvider}
                apiKey={ai.apiKey}
                onKeyChange={ai.setApiKey}
                disabled={ai.isLoading}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, X, Send, Key } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { AiDemoInfo, AiSource } from '@/lib/api';
import { aiErrorText, parseApiError } from '@/lib/ai';
import { flushPendingSave } from '@/lib/save-flush';
import { useAiOptions } from '@/hooks/useAiOptions';
import { useEditorStore } from '@/store/editor-store';
import AiKeyFields, { type AiProvider } from '@/components/ai/AiKeyFields';
import AiSavedAnswerNotice from '@/components/ai/AiSavedAnswerNotice';

interface AIBlockEditPopoverProps {
  blockId: string;
  pageId: string;
  onClose: () => void;
}

interface SavedResult {
  source: AiSource;
  demo?: AiDemoInfo;
}

export default function AIBlockEditPopover({ blockId, pageId, onClose }: AIBlockEditPopoverProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A saved variant stays on screen with its label until the user closes the popover
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini');
  const [aiKey, setAiKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceBlockData = useEditorStore((s) => s.replaceBlockData);
  // The popover lives inside the zoomed canvas: undo the zoom so its text stays readable (QA-038)
  const zoom = useEditorStore((s) => s.viewportState.zoom);
  const counterScale = zoom > 0 ? 1 / zoom : 1;
  const { options, error: optionsError } = useAiOptions(locale === 'en' ? 'en' : 'es');
  const ownKey = aiKey.trim();
  // Without their own key, in demo mode the instruction cannot be followed
  // (and neither can the suggestions, which are instructions: "translate it...")
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

  useEffect(() => {
    // Focusing must not scroll the editor shell, which has overflow hidden (QA-038)
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onClose]);

  const handleSubmit = async (text?: string) => {
    const value = (text || instruction).trim();
    if (!value || isLoading) return;

    setIsLoading(true);
    setError(null);
    setSavedResult(null);

    try {
      // The server edits its copy of the block: it must have what is on screen (QA-037)
      if (!(await flushPendingSave())) {
        setError(t('saveStatus.aiNeedsSave'));
        return;
      }
      const result = await api.ai.editBlock(
        pageId,
        blockId,
        value,
        ownKey ? { provider: aiProvider, api_key: ownKey } : undefined,
      );
      if (!replaceBlockData(blockId, result.block.type, result.block.data)) {
        // The server answered with a block type this editor does not know
        setError(t('ai.blockEditError'));
        return;
      }
      if (result.source === 'demo') {
        setSavedResult({ source: result.source, demo: result.demo });
        return;
      }
      onClose();
    } catch (e) {
      const { message, code } = parseApiError(e, t('ai.blockEditError'));
      setError(aiErrorText({ message, code }, t, t('ai.blockEditError')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-8 z-50 w-80"
      style={{ scale: String(counterScale), transformOrigin: 'top center' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-labelledby="ai-block-edit-title"
        className="bg-surface border border-subtle rounded-xl shadow-2xl shadow-black/40 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-subtle/80">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span id="ai-block-edit-title" className="text-xs font-medium text-secondary">{t('ai.blockEditTitle')}</span>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            aria-label={t('common.close')}
            className="p-1 rounded text-muted hover:text-secondary hover:bg-surface-card transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Input */}
        <div className="p-3">
          {demoEditsAhead && !savedResult && (
            <p id="ai-block-demo-note" className="text-xs text-muted mb-2.5">{t('ai.saved.block.demo_mode')}</p>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder={t('ai.blockEditPlaceholder')}
              aria-label={t('ai.blockEditTitle')}
              aria-describedby={demoEditsAhead ? 'ai-block-demo-note' : undefined}
              maxLength={500}
              disabled={isLoading}
              className="flex-1 min-w-0 bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 disabled:opacity-50"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={isLoading || !instruction.trim()}
              aria-label={t('ai.blockEditSend')}
              className="bg-violet-600 hover:bg-violet-500 text-white p-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-error mt-2 px-1" role="alert">{error}</p>
          )}

          {/* A saved variant says so */}
          {savedResult && (
            <div className="mt-2.5 space-y-2">
              <AiSavedAnswerNotice kind="block" source={savedResult.source} demo={savedResult.demo} />
              <button
                onClick={onClose}
                className="w-full text-xs font-medium text-secondary hover:text-primary px-3 py-2 rounded-lg bg-surface-elevated border border-subtle transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {/* Quick suggestions */}
          {!isLoading && !error && !savedResult && showSuggestions && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInstruction(s);
                    handleSubmit(s);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-surface-elevated border border-subtle text-secondary hover:text-primary hover:border-default transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <p className="text-xs text-primary-color mt-2 px-1 flex items-center gap-1.5" role="status">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('ai.blockEditing')}
            </p>
          )}

          {/* Own key: kept in memory only */}
          {!savedResult && (
            <div className="mt-2.5 space-y-2">
              <button
                type="button"
                onClick={() => setShowKeySetup((value) => !value)}
                aria-expanded={showKeySetup}
                aria-controls="ai-block-own-key"
                disabled={isLoading}
                className="text-[11px] text-primary-color hover:text-primary underline flex items-center gap-1 disabled:opacity-50"
              >
                <Key className="w-3 h-3" aria-hidden="true" />
                {t('ai.setupKey')}
              </button>
              {showKeySetup && (
                <div id="ai-block-own-key">
                  <AiKeyFields
                    provider={aiProvider}
                    onProviderChange={setAiProvider}
                    apiKey={aiKey}
                    onKeyChange={setAiKey}
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

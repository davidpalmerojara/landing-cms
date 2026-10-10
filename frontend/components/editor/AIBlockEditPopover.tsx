'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, X, Send, Key } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAiBlockEdit } from '@/hooks/useAiBlockEdit';
import { useEditorStore } from '@/store/editor-store';
import AiKeyFields from '@/components/ai/AiKeyFields';
import AiSavedAnswerNotice from '@/components/ai/AiSavedAnswerNotice';

interface AIBlockEditPopoverProps {
  blockId: string;
  pageId: string;
  onClose: () => void;
}

export default function AIBlockEditPopover({ blockId, pageId, onClose }: AIBlockEditPopoverProps) {
  const t = useTranslations();
  const [instruction, setInstruction] = useState('');
  const [showKeySetup, setShowKeySetup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The popover lives inside the zoomed canvas: undo the zoom so its text stays readable (QA-038)
  const zoom = useEditorStore((s) => s.viewportState.zoom);
  const counterScale = zoom > 0 ? 1 / zoom : 1;
  // Same flow as Quick Edit (QA-067); a saved variant stays on screen with its label until closed
  const {
    submit,
    isLoading,
    error,
    savedResult,
    demoEditsAhead,
    showSuggestions,
    suggestions,
    provider: aiProvider,
    setProvider: setAiProvider,
    apiKey: aiKey,
    setApiKey: setAiKey,
  } = useAiBlockEdit(pageId, blockId);

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
    if (await submit(text ?? instruction)) onClose();
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

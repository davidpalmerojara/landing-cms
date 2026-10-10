'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Key } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { AiDemoInfo, AiPromptSuggestion, AiSource } from '@/lib/api';
import { aiErrorText, parseApiError } from '@/lib/ai';
import { useAiOptions } from '@/hooks/useAiOptions';
import AiKeyFields, { type AiProvider } from '@/components/ai/AiKeyFields';
import AiModeNotice from '@/components/ai/AiModeNotice';
import AiSavedAnswerNotice from '@/components/ai/AiSavedAnswerNotice';
import AiSuggestions from '@/components/ai/AiSuggestions';

interface AIGenerateModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the page ID after successful generation */
  onGenerated: (pageId: string) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

/** Errors that mean the server's AI is not available to this user: their own key is the way forward */
const NEEDS_KEY_CODES = new Set(['AI_NOT_CONFIGURED', 'AI_PLAN_LIMIT', 'AI_INVALID_KEY']);

interface SavedResult {
  pageId: string;
  source: AiSource;
  demo?: AiDemoInfo;
}

/** Removes the empty page a failed generation left behind. */
async function discardBlankPage(pageId: string): Promise<void> {
  try {
    await api.pages.delete(pageId);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('Failed to remove the page of a failed generation:', e);
  }
}

export default function AIGenerateModal({ open, onClose, onGenerated }: AIGenerateModalProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>(locale === 'en' ? 'en' : 'es');
  const { options } = useAiOptions(language, open);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // A saved answer says so (and why) before the editor opens
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null);

  // The user's own key: kept in memory while the modal is open, sent with
  // the request and never stored (neither here nor on the server)
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini');
  const [aiKey, setAiKey] = useState('');
  const ownKey = aiKey.trim();

  const toneOptions = [
    { value: '', label: t('ai.defaultTone') },
    { value: 'professional', label: t('ai.professionalTone') },
    { value: 'creative', label: t('ai.creativeTone') },
    { value: 'minimalist', label: t('ai.minimalistTone') },
    { value: 'corporate', label: t('ai.corporateTone') },
  ];

  // Opening starts clean. Adjusting state during render (instead of in an effect) avoids a render with the old values
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setStatusMsg(null);
      setShowKeySetup(false);
      setAiKey('');
      setSavedResult(null);
    }
  }

  const pickSuggestion = (suggestion: AiPromptSuggestion) => {
    setPrompt(suggestion.prompt);
    setLanguage(suggestion.language);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setStatusMsg(t('ai.creatingPage'));

    // The endpoint needs an existing page, so one is created first and removed if generation fails
    let blankPageId: string | null = null;

    try {
      const page = await api.pages.create({ name: t('ai.generatedPageName'), blocks: [] });
      blankPageId = page.id;
      setStatusMsg(t('ai.generatingContent'));

      // Then generate blocks
      const result = await api.ai.generate(page.id, {
        prompt: prompt.trim(),
        tone,
        language,
        ...(ownKey ? { provider: aiProvider, api_key: ownKey } : {}),
      });
      setStatusMsg(t('ai.generatedBlocks', { count: result.block_count }));
      blankPageId = null;

      if (result.source === 'demo') {
        setSavedResult({ pageId: page.id, source: result.source, demo: result.demo });
        setStatusMsg(null);
      } else {
        onGenerated(page.id);
      }
    } catch (e) {
      if (blankPageId) void discardBlankPage(blankPageId);
      const { message, code } = parseApiError(e, t('ai.generateError'));
      // No server key, or the plan doesn't include AI: the user's own key works
      if (code && NEEDS_KEY_CODES.has(code)) setShowKeySetup(true);
      setError(aiErrorText({ message, code }, t, t('ai.generateError')));
      setStatusMsg(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // The page already exists and has its blocks: closing after a result opens it
  const dismiss = useCallback(() => {
    if (savedResult) onGenerated(savedResult.pageId);
    else onClose();
  }, [savedResult, onGenerated, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) dismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isGenerating, dismiss]);

  if (!open) return null;

  const isLocked = isGenerating || savedResult !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isGenerating ? undefined : dismiss} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-generate-title"
        className="relative bg-surface border border-subtle rounded-2xl shadow-2xl shadow-black/40 w-full max-w-2xl mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-primary to-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 id="ai-generate-title" className="text-lg font-semibold text-primary">{t('ai.title')}</h2>
              <p className="text-xs text-muted">{t('ai.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            disabled={isGenerating}
            aria-label={t('common.close')}
            className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-surface-card transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!savedResult && options && (
            <AiSuggestions prompts={options.prompts} onPick={pickSuggestion} disabled={isGenerating} />
          )}

          {/* Prompt */}
          <div>
            <label htmlFor="ai-prompt" className="text-xs font-medium text-secondary mb-1.5 block">{t('ai.descriptionLabel')}</label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('ai.placeholder')}
              aria-describedby="ai-mode-notice"
              rows={5}
              maxLength={2000}
              disabled={isLocked}
              className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-primary placeholder-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 disabled:opacity-50"
            />
            <div className="flex items-start justify-between gap-3 mt-1">
              <AiModeNotice
                id="ai-mode-notice"
                mode={options?.mode ?? null}
                ownKeyProvider={showKeySetup && ownKey ? aiProvider : null}
                liveUserDailyLimit={options?.live_user_daily_limit ?? 0}
              />
              <span className="text-[10px] text-muted shrink-0">{prompt.length}/2000</span>
            </div>
          </div>

          {/* Options row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-secondary mb-1.5 block">{t('ai.tone')}</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={isLocked}
                className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                {toneOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-secondary mb-1.5 block">{t('ai.language')}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
                disabled={isLocked}
                className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Own key: always available, kept in memory only */}
          {!savedResult && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowKeySetup((value) => !value)}
                aria-expanded={showKeySetup}
                aria-controls="ai-own-key"
                disabled={isGenerating}
                className="text-xs text-primary-color hover:text-primary-color/80 underline flex items-center gap-1 min-h-11 md:min-h-0 disabled:opacity-50"
              >
                <Key className="w-3 h-3" aria-hidden="true" />
                {t('ai.setupKey')}
              </button>
              {showKeySetup && (
                <div id="ai-own-key">
                  <AiKeyFields
                    provider={aiProvider}
                    onProviderChange={setAiProvider}
                    apiKey={aiKey}
                    onKeyChange={setAiKey}
                    disabled={isGenerating}
                  />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-lg px-4 py-3" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* A saved answer says so before the editor opens */}
          {savedResult && (
            <AiSavedAnswerNotice kind="page" source={savedResult.source} demo={savedResult.demo} />
          )}

          {/* Generating status */}
          {isGenerating && statusMsg && (
            <div className="flex items-center gap-3 text-sm text-secondary bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary-color shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle/80">
          {savedResult ? (
            <button
              onClick={dismiss}
              className="flex items-center gap-2 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
            >
              {t('ai.openEditor')}
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isGenerating}
                className="text-sm font-medium text-secondary hover:text-primary px-4 py-2 rounded-lg hover:bg-surface-card transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center gap-2 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? t('ai.generatingAction') : t('ai.generatePage')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

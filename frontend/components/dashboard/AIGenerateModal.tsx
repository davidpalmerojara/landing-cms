'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Key } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

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

export default function AIGenerateModal({ open, onClose, onGenerated }: AIGenerateModalProps) {
  const t = useTranslations();
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  // AI key setup state
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiKey, setAiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  const toneOptions = [
    { value: '', label: t('ai.defaultTone') },
    { value: 'professional', label: t('ai.professionalTone') },
    { value: 'creative', label: t('ai.creativeTone') },
    { value: 'minimalist', label: t('ai.minimalistTone') },
    { value: 'corporate', label: t('ai.corporateTone') },
  ];

  useEffect(() => {
    if (!open) return;
    // Reset state when opening
    setError(null);
    setStatusMsg(null);
    setNeedsKey(false);
    setShowKeySetup(false);
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setStatusMsg(t('ai.creatingPage'));

    try {
      // First create a blank page
      const page = await api.pages.create({ name: t('ai.generatedPageName'), blocks: [] });
      setStatusMsg(t('ai.generatingContent'));

      // Then generate blocks
      const result = await api.ai.generate(page.id, { prompt: prompt.trim(), tone, language });
      setStatusMsg(t('ai.generatedBlocks', { count: result.block_count }));

      // Navigate to editor
      onGenerated(page.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('ai.generateError');
      // Parse API error JSON
      let friendlyError = msg;
      try {
        const match = msg.match(/API \d+: (.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          friendlyError = parsed.error || msg;
          // Check if it's a missing key error
          if (friendlyError.includes('API key') || friendlyError.includes('clave')) {
            setNeedsKey(true);
          }
        }
      } catch {
        // Use raw message
      }
      setError(friendlyError);
      setStatusMsg(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveKey = async () => {
    if (!aiKey.trim()) return;
    setIsSavingKey(true);
    try {
      await api.ai.saveSettings({ ai_provider: aiProvider, ai_api_key: aiKey.trim() });
      setShowKeySetup(false);
      setNeedsKey(false);
      setError(null);
      setAiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ai.saveKeyError'));
    } finally {
      setIsSavingKey(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isGenerating, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isGenerating ? undefined : onClose} />

      <div className="relative bg-surface border border-subtle rounded-2xl shadow-2xl shadow-black/40 w-full max-w-2xl mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle\/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-primary to-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">{t('ai.title')}</h2>
              <p className="text-xs text-muted">{t('ai.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-surface-card transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">{t('ai.descriptionLabel')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('ai.placeholder')}
              rows={5}
              maxLength={2000}
              disabled={isGenerating}
              className="w-full bg-surface-elevated border border-subtle rounded-xl px-4 py-3 text-sm text-primary placeholder-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 disabled:opacity-50"
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-muted">{prompt.length}/2000</span>
            </div>
          </div>

          {/* Options row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-secondary mb-1.5 block">{t('ai.tone')}</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={isGenerating}
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
                disabled={isGenerating}
                className="w-full bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {needsKey && !showKeySetup && (
                  <button
                    onClick={() => setShowKeySetup(true)}
                    className="mt-2 text-xs text-primary-color hover:text-primary-color/80 underline flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    {t('ai.setupKey')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inline key setup */}
          {showKeySetup && (
            <div className="bg-surface-elevated\/50 border border-subtle rounded-xl p-4 space-y-3">
              <p className="text-xs text-secondary">
                {t('ai.keyHelpText')}{' '}
                <span className="text-primary-color">aistudio.google.com</span>
              </p>
              <div className="flex gap-2">
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="bg-surface-card border border-default rounded-lg px-3 py-2 text-sm text-primary focus:outline-none"
                >
                  <option value="gemini">{t('ai.providerGemini')}</option>
                  <option value="anthropic">{t('ai.providerAnthropic')}</option>
                </select>
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={aiProvider === 'gemini' ? 'AIzaSy...' : 'sk-ant-...'}
                  className="flex-1 bg-surface-card border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleSaveKey}
                  disabled={isSavingKey || !aiKey.trim()}
                  className="text-white font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #2563EB 0%, #2563EB 100%)' }}
                >
                  {isSavingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  {t('common.save')}
                </button>
              </div>
            </div>
          )}

          {/* Generating status */}
          {isGenerating && statusMsg && (
            <div className="flex items-center gap-3 text-sm text-secondary bg-primary\/5 border border-primary/20 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary-color shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle\/80">
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
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, X, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useEditorStore } from '@/store/editor-store';

interface AIBlockEditPopoverProps {
  blockId: string;
  pageId: string;
  onClose: () => void;
}

export default function AIBlockEditPopover({ blockId, pageId, onClose }: AIBlockEditPopoverProps) {
  const t = useTranslations();
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceBlockData = useEditorStore((s) => s.replaceBlockData);
  const suggestions = [
    t('ai.blockSuggestion1'),
    t('ai.blockSuggestion2'),
    t('ai.blockSuggestion3'),
    t('ai.blockSuggestion4'),
    t('ai.blockSuggestion5'),
  ];

  useEffect(() => {
    inputRef.current?.focus();
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

    try {
      const result = await api.ai.editBlock(pageId, blockId, value);
      replaceBlockData(blockId, result.block.type, result.block.data);
      onClose();
    } catch (e) {
      let msg = e instanceof Error ? e.message : t('ai.blockEditError');
      try {
        const match = msg.match(/API \d+: (.+)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          msg = parsed.error || msg;
        }
      } catch {
        // Use raw message
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-8 z-50 w-80"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-surface border border-subtle rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-subtle\/80">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-medium text-secondary">{t('ai.blockEditTitle')}</span>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded text-muted hover:text-secondary hover:bg-surface-card transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Input */}
        <div className="p-3">
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
              maxLength={500}
              disabled={isLoading}
              className="flex-1 bg-surface-elevated border border-subtle rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 disabled:opacity-50"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={isLoading || !instruction.trim()}
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
            <p className="text-xs text-red-400 mt-2 px-1">{error}</p>
          )}

          {/* Quick suggestions */}
          {!isLoading && !error && (
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
            <p className="text-xs text-violet-400 mt-2 px-1 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('ai.blockEditing')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

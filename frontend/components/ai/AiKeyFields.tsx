'use client';

import { useTranslations } from 'next-intl';

export type AiProvider = 'gemini' | 'anthropic';

interface AiKeyFieldsProps {
  provider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
  apiKey: string;
  onKeyChange: (key: string) => void;
  disabled?: boolean;
}

/**
 * The user's own provider and key. It lives in the parent's state, goes out with
 * one request and is never stored, here or on the server.
 */
export default function AiKeyFields({ provider, onProviderChange, apiKey, onKeyChange, disabled = false }: AiKeyFieldsProps) {
  const t = useTranslations();

  return (
    <div className="bg-surface-elevated/50 border border-subtle rounded-xl p-4 space-y-3">
      <p className="text-xs text-secondary">
        {t('ai.keyHelpText')}{' '}
        <span className="text-primary-color">aistudio.google.com</span>
      </p>
      <div className="flex gap-2">
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value === 'anthropic' ? 'anthropic' : 'gemini')}
          aria-label={t('ai.providerLabel')}
          disabled={disabled}
          className="bg-surface-card border border-default rounded-lg px-3 py-2 min-h-11 md:min-h-0 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="gemini">{t('ai.providerGemini')}</option>
          <option value="anthropic">{t('ai.providerAnthropic')}</option>
        </select>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          aria-label={t('ai.keyLabel')}
          autoComplete="off"
          disabled={disabled}
          placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-ant-...'}
          className="flex-1 min-w-0 bg-surface-card border border-default rounded-lg px-3 py-2 min-h-11 md:min-h-0 text-sm text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      <p className="text-xs text-muted">{t('ai.keyNotStored')}</p>
    </div>
  );
}

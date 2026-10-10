import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_ERROR_CODES,
  aiErrorMessageKey,
  aiErrorText,
  modeNoticeKey,
  parseApiError,
  savedAnswerLabelKeys,
} from '@/lib/ai';
import { MESSAGES, LOCALES } from '@/lib/i18n';

function lookup(messages: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (
    typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined
  ), messages);
}

describe('parseApiError', () => {
  it('reads the message and code of the backend envelope', () => {
    const error = new Error('API 422: {"error":"Sin variante","code":"DEMO_NO_VARIANT"}');
    expect(parseApiError(error, 'fallback')).toEqual({ message: 'Sin variante', code: 'DEMO_NO_VARIANT' });
  });

  it('falls back when the body is not JSON', () => {
    expect(parseApiError(new Error('API 502: <html>bad gateway</html>'), 'fallback'))
      .toEqual({ message: 'API 502: <html>bad gateway</html>', code: null });
    expect(parseApiError('not an error', 'fallback')).toEqual({ message: 'fallback', code: null });
  });

  it('uses the fallback when the body has no message', () => {
    expect(parseApiError(new Error('API 400: {"details":{}}'), 'fallback')).toEqual({ message: 'fallback', code: null });
  });
});

describe('saved answer labels', () => {
  it('has no label for real answers', () => {
    expect(savedAnswerLabelKeys('page', 'live', undefined)).toEqual([]);
    expect(savedAnswerLabelKeys('block', 'own_key', undefined)).toEqual([]);
  });

  it('picks the label by kind and reason', () => {
    expect(savedAnswerLabelKeys('page', 'demo', { reason: 'daily_limit', matched: true })).toEqual(['ai.saved.page.daily_limit']);
    expect(savedAnswerLabelKeys('block', 'demo', { reason: 'provider_quota' })).toEqual(['ai.saved.block.provider_quota']);
  });

  it('never says a hand-written example was generated with AI', () => {
    expect(savedAnswerLabelKeys('page', 'demo', { reason: 'demo_mode', origin: 'placeholder', matched: true }))
      .toEqual(['ai.saved.page.demo_mode_placeholder']);
    // Older responses without origin: assume hand-written, never claim AI
    expect(savedAnswerLabelKeys('page', 'demo', { reason: 'demo_mode', matched: true }))
      .toEqual(['ai.saved.page.demo_mode_placeholder']);
    expect(savedAnswerLabelKeys('page', 'demo', { reason: 'demo_mode', origin: 'generated', matched: true }))
      .toEqual(['ai.saved.page.demo_mode']);
  });

  it('adds the unmatched note only for a page that matched no example', () => {
    expect(savedAnswerLabelKeys('page', 'demo', { reason: 'demo_mode', origin: 'generated', matched: false }))
      .toEqual(['ai.saved.page.demo_mode', 'ai.saved.noExampleMatched']);
    expect(savedAnswerLabelKeys('block', 'demo', { reason: 'demo_mode', matched: false })).toEqual(['ai.saved.block.demo_mode']);
  });

  it('picks the notice by mode, or by provider when the user brings a key', () => {
    expect(modeNoticeKey('demo', null)).toBe('ai.notice.demo');
    expect(modeNoticeKey(null, null)).toBeNull();
    expect(modeNoticeKey('demo', 'anthropic')).toBe('ai.notice.ownKey.anthropic');
  });
});

describe('AI messages exist in both languages', () => {
  const keys = [
    ...(['page', 'block'] as const).flatMap((kind) =>
      (['demo_mode', 'daily_limit', 'provider_quota'] as const).flatMap((reason) =>
        savedAnswerLabelKeys(kind, 'demo', { reason, matched: false }))),
    ...(['demo', 'live', 'unavailable'] as const).map((mode) => modeNoticeKey(mode, null)),
    modeNoticeKey('demo', 'gemini'),
    modeNoticeKey('demo', 'anthropic'),
    ...AI_ERROR_CODES.map((code) => aiErrorMessageKey(code)),
    'ai.suggestionsLabel',
    'ai.openEditor',
    'ai.blockEditSend',
  ];

  it.each(LOCALES)('%s has every key as non-empty text', (locale) => {
    for (const key of keys) {
      expect(typeof key).toBe('string');
      const text = lookup(MESSAGES[locale], key as string);
      expect(typeof text, `${locale} ${key}`).toBe('string');
      expect((text as string).length, `${locale} ${key}`).toBeGreaterThan(10);
    }
  });

  it('English differs from Spanish for each of them', () => {
    for (const key of keys) {
      expect(lookup(MESSAGES.en, key as string), key as string).not.toBe(lookup(MESSAGES.es, key as string));
    }
  });
});

describe('AI error codes', () => {
  /** Every 'UPPER_SNAKE' literal in the backend views is an error code (the other constants are lowercase). */
  const backendCodes = Array.from(
    new Set(
      readFileSync(resolve(__dirname, '../../../backend/ai_generation/views.py'), 'utf8').match(/'[A-Z][A-Z_]+'/g) ?? [],
    ),
    (literal) => literal.slice(1, -1),
  );

  it('finds the codes in the backend file', () => {
    expect(backendCodes).toEqual(expect.arrayContaining(['AI_PLAN_LIMIT', 'AI_INVALID_OUTPUT', 'DEMO_NO_VARIANT']));
  });

  it('translates every code the AI views can return', () => {
    for (const code of backendCodes) {
      expect(aiErrorMessageKey(code), code).not.toBeNull();
    }
  });

  it('translates the generic codes of the error envelope', () => {
    const handler = readFileSync(resolve(__dirname, '../../../backend/config/exception_handler.py'), 'utf8');
    const envelopeCodes = Array.from(handler.matchAll(/'([A-Z][A-Z_]+)'/g), (match) => match[1])
      .filter((code) => code !== 'ERROR' && code !== 'VALIDATION_ERROR' && code !== 'METHOD_NOT_ALLOWED' && code !== 'CONFLICT');
    expect(envelopeCodes).toEqual(expect.arrayContaining(['BAD_REQUEST', 'THROTTLED', 'INTERNAL_ERROR']));
    for (const code of envelopeCodes) {
      expect(aiErrorMessageKey(code), code).not.toBeNull();
    }
  });

  it('never shows the backend text of a code it knows or does not know', () => {
    const t = (key: string) => `[${key}]`;
    expect(aiErrorText({ message: 'Texto en español', code: 'AI_PLAN_LIMIT' }, t, 'fallback')).toBe('[ai.errors.planLimit]');
    expect(aiErrorText({ message: 'Texto en español', code: 'SOMETHING_NEW' }, t, 'fallback')).toBe('fallback');
  });

  it('keeps the message of an error without a code (the network, not the backend)', () => {
    expect(aiErrorText({ message: 'Failed to fetch', code: null }, (key) => key, 'fallback')).toBe('Failed to fetch');
  });
});

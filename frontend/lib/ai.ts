import type { AiDemoInfo, AiOptions, AiSource } from '@/lib/api';

export type AiAnswerKind = 'page' | 'block';

export interface ParsedApiError {
  message: string;
  /** The backend's stable error code, when the body had one */
  code: string | null;
}

/** The `{ error, code }` body of an `API <status>: <body>` error thrown by `lib/api.ts`. */
export function parseApiError(error: unknown, fallback: string): ParsedApiError {
  const raw = error instanceof Error ? error.message : '';
  const body = raw.replace(/^API \d+: /, '');
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const { error: message, code } = parsed as { error?: unknown; code?: unknown };
      return {
        message: typeof message === 'string' && message ? message : fallback,
        code: typeof code === 'string' ? code : null,
      };
    }
  } catch {
    // Not a JSON body (a network failure, a proxy page): show what we have
  }
  return { message: raw || fallback, code: null };
}

/** Error codes the backend sends in Spanish, with a translated message in the "ai" namespace. */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  DEMO_NO_VARIANT: 'ai.errorNoVariant',
  AI_KEY_QUOTA: 'ai.errorKeyQuota',
};

export function aiErrorMessageKey(code: string | null): string | null {
  return code ? ERROR_MESSAGE_KEYS[code] ?? null : null;
}

/**
 * The label for an answer that was not generated just now, or null when it was.
 * A saved page also says so when the description matched none of the examples.
 */
export function savedAnswerLabelKeys(kind: AiAnswerKind, source: AiSource, demo: AiDemoInfo | undefined): string[] {
  if (source !== 'demo') return [];
  const reason = demo?.reason ?? 'demo_mode';
  // Never say "generated with AI" about pages a person wrote
  const handWritten = kind === 'page' && reason === 'demo_mode' && demo?.origin !== 'generated';
  const keys = [handWritten ? 'ai.saved.page.demo_mode_placeholder' : `ai.saved.${kind}.${reason}`];
  if (kind === 'page' && demo?.matched === false) keys.push('ai.saved.noExampleMatched');
  return keys;
}

/** Key of the short notice next to the input: what happens to what the user types. */
export function modeNoticeKey(mode: AiOptions['mode'] | null, ownKeyProvider: 'gemini' | 'anthropic' | null): string | null {
  if (ownKeyProvider) return `ai.notice.ownKey.${ownKeyProvider}`;
  if (mode === null) return null;
  return `ai.notice.${mode}`;
}

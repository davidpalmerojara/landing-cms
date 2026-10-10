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

/**
 * Every error code the AI endpoints can answer with, and the message to show.
 * The backend's `error` text is in Spanish, so the interface never shows it:
 * `__tests__/lib/ai.test.ts` checks this table against the codes in
 * `backend/ai_generation/views.py`. The rest are the errors the same requests
 * can meet before reaching the AI: the page the modal creates first, and the
 * generic envelope of `backend/config/exception_handler.py`.
 */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  AI_NOT_CONFIGURED: 'ai.errors.notConfigured',
  AI_PLAN_LIMIT: 'ai.errors.planLimit',
  AI_KEY_QUOTA: 'ai.errors.keyQuota',
  AI_INVALID_KEY: 'ai.errors.invalidKey',
  AI_PROVIDER_ERROR: 'ai.errors.providerError',
  AI_INVALID_OUTPUT: 'ai.errors.invalidOutput',
  DEMO_NO_VARIANT: 'ai.errors.noVariant',
  DEMO_FIXTURE_INVALID: 'ai.errors.fixtureInvalid',
  GUEST_PAGE_LIMIT: 'guest.pageLimit',
  NOT_FOUND: 'ai.errors.notFound',
  BAD_REQUEST: 'ai.errors.badRequest',
  UNAUTHORIZED: 'ai.errors.unauthorized',
  FORBIDDEN: 'ai.errors.forbidden',
  THROTTLED: 'ai.errors.throttled',
  INTERNAL_ERROR: 'ai.errors.internal',
};

export const AI_ERROR_CODES: readonly string[] = Object.keys(ERROR_MESSAGE_KEYS);

export function aiErrorMessageKey(code: string | null): string | null {
  return code ? ERROR_MESSAGE_KEYS[code] ?? null : null;
}

/**
 * The text to show for a failed AI request, in the interface language.
 * A known code gets its translated message; an unknown code gets `fallback`
 * (the backend's own text would be Spanish); an error without a code (network
 * failure) keeps what it says.
 */
export function aiErrorText(error: ParsedApiError, t: (key: string) => string, fallback: string): string {
  const key = aiErrorMessageKey(error.code);
  if (key) return t(key);
  return error.code ? fallback : error.message;
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

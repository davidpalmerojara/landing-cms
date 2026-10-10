/**
 * Turning a failed request into something to tell the user, in their language.
 *
 * The backend answers errors as `{ error, code, details? }` with `error` in
 * Spanish, so the interface never shows the body: messages are chosen by
 * `code` (and by HTTP status when there is no code). A request that never got
 * an answer (no connection, server down, CORS) is "offline", and only that is.
 *
 *   setError(apiErrorMessage(e, t, 'editor.publishError'));
 *   if (isRetryableError(e)) scheduleRetry();
 *   validationErrors(e)  // field errors of a 400, block by block
 */
import { ApiError } from '@/lib/api';
import type { DataPath } from '@/types/block-data';

/** next-intl's `t` from `useTranslations()` (root namespace) fits this. */
export type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

export type ApiErrorKind =
  | 'offline'
  | 'session'
  | 'forbidden'
  | 'notOwner'
  | 'notFound'
  | 'validation'
  | 'conflict'
  | 'planLimit'
  | 'throttled'
  | 'server'
  | 'unknown';

/** No answer from the server: the request failed before any HTTP status (offline, DNS, CORS, server down). */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  // fetch rejects with a TypeError when it gets no response
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'NetworkError');
}

export function apiErrorKind(error: unknown): ApiErrorKind {
  if (isNetworkError(error)) return 'offline';
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.code === 'NOT_OWNER') return 'notOwner';
  if (error.code === 'VERSION_CONFLICT' || error.status === 409) return 'conflict';
  if (error.body?.error === 'plan_limit' || error.code === 'PLAN_LIMIT') return 'planLimit';
  if (error.status === 401) return 'session';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'notFound';
  if (error.status === 429) return 'throttled';
  if (error.status >= 500) return 'server';
  if (error.status === 400) return 'validation';
  return 'unknown';
}

/** Worth sending again later, unchanged: no answer, a server error or a rate limit. */
export function isRetryableError(error: unknown): boolean {
  const kind = apiErrorKind(error);
  return kind === 'offline' || kind === 'server' || kind === 'throttled';
}

const KIND_MESSAGE_KEYS: Partial<Record<ApiErrorKind, string>> = {
  offline: 'apiErrors.offline',
  session: 'apiErrors.session',
  forbidden: 'apiErrors.forbidden',
  notOwner: 'apiErrors.notOwner',
  notFound: 'apiErrors.notFound',
  conflict: 'apiErrors.conflict',
  planLimit: 'apiErrors.planLimit',
  throttled: 'apiErrors.throttled',
  server: 'apiErrors.server',
};

/**
 * The message for a failed request: by error kind (code or status), or
 * `t(fallbackKey)` when the kind says nothing useful (a 400, an unknown code).
 * Never the server's own text.
 */
export function apiErrorMessage(error: unknown, t: Translate, fallbackKey: string): string {
  return apiErrorKindMessage(apiErrorKind(error), t, fallbackKey);
}

/** `apiErrorMessage` for an error already classified (e.g. kept in the store as its kind). */
export function apiErrorKindMessage(kind: ApiErrorKind, t: Translate, fallbackKey: string): string {
  return t(KIND_MESSAGE_KEYS[kind] ?? fallbackKey);
}

// --- Field errors of a 400 ---

/** One field the server refused in a page save. */
export interface ServerFieldError {
  /** Index in the `blocks` array that was sent; null for a page field (name, SEO, tokens). */
  blockIndex: number | null;
  /**
   * In a block: the path inside its data (`['links', 0, 'url']`), or `[]` when
   * the block as a whole was refused (too large, styles). For a page field:
   * its API name (`['seo_title']`).
   */
  path: DataPath;
  messages: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  if (isRecord(value)) return Object.values(value).flatMap(messagesOf);
  return [];
}

/** `links[0].url` -> ['links', 0, 'url'] (the key format of backend/pages/block_validators.py). */
export function parseDataKey(key: string): DataPath {
  const path: (string | number)[] = [];
  for (const part of key.split('.')) {
    const match = /^([^[\]]+)\[(\d+)\]$/.exec(part);
    if (match) path.push(match[1], Number(match[2]));
    else path.push(part);
  }
  return path;
}

function blockErrors(index: number, value: unknown): ServerFieldError[] {
  if (!isRecord(value)) {
    const messages = messagesOf(value);
    return messages.length ? [{ blockIndex: index, path: [], messages }] : [];
  }
  const errors: ServerFieldError[] = [];
  for (const [field, detail] of Object.entries(value)) {
    if (field === 'data' && isRecord(detail)) {
      for (const [key, messages] of Object.entries(detail)) {
        errors.push({ blockIndex: index, path: parseDataKey(key), messages: messagesOf(messages) });
      }
    } else {
      // The data as a whole (size limit), its type or its styles
      const messages = messagesOf(detail);
      if (messages.length) errors.push({ blockIndex: index, path: [], messages });
    }
  }
  return errors;
}

/**
 * The fields a 400 on `PUT /api/pages/{id}/` refused, from its `details`.
 * Empty for any other error, or when the refusal names no field (for example
 * "two blocks share an id"): nothing can be pointed at.
 */
export function validationErrors(error: unknown): ServerFieldError[] {
  if (!(error instanceof ApiError) || error.status !== 400) return [];
  const details = error.body?.details;
  if (!isRecord(details)) return [];

  const errors: ServerFieldError[] = [];
  for (const [field, value] of Object.entries(details)) {
    if (field === 'blocks') {
      // One entry per block sent, `{}` for the valid ones; a plain list of strings names no block
      if (Array.isArray(value) && value.some(isRecord)) {
        value.forEach((entry, index) => errors.push(...blockErrors(index, entry)));
      }
      continue;
    }
    const messages = messagesOf(value);
    if (messages.length) errors.push({ blockIndex: null, path: [field], messages });
  }
  return errors;
}

// --- The server's rule, in the user's language ---

export type RuleMessageKey = 'maxLength' | 'maxItems' | 'link' | 'url' | 'choice' | 'tooLarge' | 'required' | 'invalid';

export interface RuleMessage {
  key: RuleMessageKey;
  values?: { max: number };
}

/**
 * Which rule a server validation message is about, so the editor can say it
 * in the interface language (the server writes them in Spanish). The texts
 * come from backend/pages/block_validators.py, block_sanitizers.py and DRF's
 * own field messages; `__tests__/lib/api-errors.test.ts` checks them.
 */
export function ruleMessage(serverMessage: string): RuleMessage {
  const max = /(\d+)\s+(?:caracteres|characters)/i.exec(serverMessage);
  if (max) return { key: 'maxLength', values: { max: Number(max[1]) } };
  const items = /(\d+)\s+(?:elementos|items)/i.exec(serverMessage);
  if (items) return { key: 'maxItems', values: { max: Number(items[1]) } };
  if (/enlace/i.test(serverMessage)) return { key: 'link' };
  if (/url/i.test(serverMessage)) return { key: 'url' };
  if (/valor inválido|not a valid choice/i.test(serverMessage)) return { key: 'choice' };
  if (/demasiado grande|too large/i.test(serverMessage)) return { key: 'tooLarge' };
  if (/obligatorio|required|null/i.test(serverMessage)) return { key: 'required' };
  return { key: 'invalid' };
}

/** `ruleMessage` translated with keys under `saveStatus.rules`. */
export function ruleMessageText(serverMessage: string, t: Translate): string {
  const { key, values } = ruleMessage(serverMessage);
  return t(`saveStatus.rules.${key}`, values);
}

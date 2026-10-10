import { ApiError, isPlanLimitError } from '@/lib/api';

/** next-intl's `t`, as far as this file needs it. */
export type Translate = (key: string) => string;

/**
 * Message key by backend error code. The server's own `error` text is never
 * shown (it can be in another language and may expose internals): the
 * interface says what it knows from the code.
 */
const CODE_MESSAGE_KEYS: Record<string, string> = {
  FEATURE_DISABLED: 'errors.billingDisabled',
  BILLING_NOT_CONFIGURED: 'errors.billingDisabled',
  BILLING_PROVIDER_ERROR: 'errors.billingProvider',
  GUEST_PAGE_LIMIT: 'guest.pageLimit',
  GUEST_NOT_ALLOWED: 'errors.guestNotAllowed',
  GUEST_CAPACITY: 'guest.errorCapacity',
  NOT_OWNER: 'errors.notOwner',
  THROTTLED: 'errors.throttled',
  UNAUTHORIZED: 'errors.unauthorized',
  INTERNAL_ERROR: 'errors.server',
};

/** The message key for a failed request, or null when nothing specific is known. */
export function accountErrorKey(error: unknown): string | null {
  if (isPlanLimitError(error)) return 'dashboard.planLimit';
  if (error instanceof ApiError) {
    if (error.code && CODE_MESSAGE_KEYS[error.code]) return CODE_MESSAGE_KEYS[error.code];
    if (error.status === 429) return 'errors.throttled';
    if (error.status === 401) return 'errors.unauthorized';
    if (error.status >= 500) return 'errors.server';
    return null;
  }
  // fetch() rejects with a TypeError when the network is down or the server is unreachable
  if (error instanceof TypeError) return 'errors.network';
  return null;
}

/**
 * Text for a failed request: translated by code or status, otherwise
 * `fallbackKey`. Never the raw `API 500: {...}` message.
 */
export function accountErrorMessage(error: unknown, t: Translate, fallbackKey: string): string {
  return t(accountErrorKey(error) ?? fallbackKey);
}

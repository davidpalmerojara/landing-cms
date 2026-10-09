import { ApiError } from '@/lib/api';

/** The template a guest starts with: the most complete one, so the demo shows the whole editor. */
export const GUEST_TEMPLATE_ID = 'saas-landing';

const HOUR_MS = 60 * 60 * 1000;

/** Whole hours left in a guest session, rounded up (a session with 10 minutes left shows 1). 0 once expired. */
export function guestHoursLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return null;
  return Math.max(0, Math.ceil((expires - now) / HOUR_MS));
}

export type GuestStartErrorKey = 'guest.errorThrottled' | 'guest.errorCapacity' | 'guest.errorGeneric';

/** Which message explains why a guest session could not be started. */
export function guestStartErrorKey(error: unknown): GuestStartErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === 'THROTTLED') return 'guest.errorThrottled';
    if (error.status === 503 || error.code === 'GUEST_CAPACITY') return 'guest.errorCapacity';
  }
  return 'guest.errorGeneric';
}

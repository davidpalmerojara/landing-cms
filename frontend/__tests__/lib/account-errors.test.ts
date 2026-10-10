import { describe, expect, it } from 'vitest';
import { accountErrorKey, accountErrorMessage } from '@/lib/account-errors';
import { ApiError } from '@/lib/api';

const t = (key: string) => `[${key}]`;

describe('accountErrorKey', () => {
  it.each([
    ['429', new ApiError(429, 'Request was throttled'), 'errors.throttled'],
    ['a THROTTLED code', new ApiError(429, '{"error":"x","code":"THROTTLED"}'), 'errors.throttled'],
    ['a 500', new ApiError(500, '<html>oops</html>'), 'errors.server'],
    ['a 502', new ApiError(502, '{"error":"x","code":"BILLING_PROVIDER_ERROR"}'), 'errors.billingProvider'],
    ['a disabled feature', new ApiError(503, '{"error":"x","code":"FEATURE_DISABLED"}'), 'errors.billingDisabled'],
    ['an expired session', new ApiError(401, '{"detail":"x"}'), 'errors.unauthorized'],
    ['a guest page limit', new ApiError(403, '{"error":"x","code":"GUEST_PAGE_LIMIT"}'), 'guest.pageLimit'],
    ['a plan limit', new ApiError(403, '{"error":"plan_limit","message":"x"}'), 'dashboard.planLimit'],
    ['a network failure', new TypeError('Failed to fetch'), 'errors.network'],
  ])('maps %s', (_label, error, key) => {
    expect(accountErrorKey(error)).toBe(key);
  });

  it('knows nothing about a plain 400 or an unknown error', () => {
    expect(accountErrorKey(new ApiError(400, '{"error":"x","code":"BAD_REQUEST"}'))).toBeNull();
    expect(accountErrorKey(new Error('x'))).toBeNull();
    expect(accountErrorKey('x')).toBeNull();
  });
});

describe('accountErrorMessage', () => {
  it('QA-052: never returns the raw "API 500: {...}" text', () => {
    const message = accountErrorMessage(new ApiError(500, '{"error":"STRIPE_SECRET_KEY not configured"}'), t, 'dashboard.createError');

    expect(message).toBe('[errors.server]');
    expect(message).not.toContain('STRIPE');
  });

  it('uses the fallback when nothing specific is known', () => {
    expect(accountErrorMessage(new ApiError(400, '{}'), t, 'dashboard.createError')).toBe('[dashboard.createError]');
  });
});

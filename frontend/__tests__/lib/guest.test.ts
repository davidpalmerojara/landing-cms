import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorCode } from '@/lib/api';
import { guestHoursLeft, guestStartErrorKey } from '@/lib/guest';
import { validateSignUp } from '@/lib/auth-validation';

const NOW = Date.parse('2026-10-09T12:00:00Z');

describe('guestHoursLeft', () => {
  it('is null for accounts that do not expire', () => {
    expect(guestHoursLeft(null, NOW)).toBeNull();
    expect(guestHoursLeft('not a date', NOW)).toBeNull();
  });

  it('rounds up to whole hours and stops at 0', () => {
    expect(guestHoursLeft('2026-10-10T12:00:00Z', NOW)).toBe(24);
    expect(guestHoursLeft('2026-10-09T12:10:00Z', NOW)).toBe(1);
    expect(guestHoursLeft('2026-10-09T11:00:00Z', NOW)).toBe(0);
  });
});

describe('guestStartErrorKey', () => {
  it('tells throttling, capacity and everything else apart', () => {
    expect(guestStartErrorKey(new ApiError(429, '{}'))).toBe('guest.errorThrottled');
    expect(guestStartErrorKey(new ApiError(503, JSON.stringify({ code: 'GUEST_CAPACITY' })))).toBe('guest.errorCapacity');
    expect(guestStartErrorKey(new ApiError(500, 'x'))).toBe('guest.errorGeneric');
    expect(guestStartErrorKey(new TypeError('Failed to fetch'))).toBe('guest.errorGeneric');
  });
});

describe('ApiError', () => {
  it('keeps the historical message and exposes the backend code and field errors', () => {
    const body = JSON.stringify({ error: 'Error de validación.', code: 'BAD_REQUEST', details: { email: ['Mal'], n: 3 } });
    const error = new ApiError(400, body);

    expect(error.message).toBe(`API 400: ${body}`);
    expect(error.status).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.details).toEqual({ email: ['Mal'], n: [] });
    expect(apiErrorCode(error)).toBe('BAD_REQUEST');
  });

  it('copes with bodies that are not JSON', () => {
    const error = new ApiError(502, '<html>Bad gateway</html>');
    expect(error.code).toBeNull();
    expect(error.details).toBeNull();
    expect(apiErrorCode(new Error('x'))).toBeNull();
  });
});

describe('validateSignUp', () => {
  const valid = { username: 'ana', email: 'ana@example.com', password: 'Str0ng-pass-123', password2: 'Str0ng-pass-123' };

  it('accepts a complete form', () => {
    expect(validateSignUp(valid)).toEqual({});
  });

  it('requires every field', () => {
    expect(validateSignUp({ username: ' ', email: '', password: '', password2: '' })).toEqual({
      username: 'required', email: 'required', password: 'required', password2: 'required',
    });
  });

  it('checks the email shape and that both passwords match', () => {
    expect(validateSignUp({ ...valid, email: 'ana@example' })).toEqual({ email: 'invalidEmail' });
    expect(validateSignUp({ ...valid, password2: 'other' })).toEqual({ password2: 'passwordMismatch' });
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  api,
} from '@/lib/api';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function noContentResponse() {
  return Promise.resolve({
    ok: true,
    status: 204,
    json: () => Promise.resolve(undefined),
    text: () => Promise.resolve(''),
  });
}

function errorResponse(status: number, body = 'Error') {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ detail: body }),
    text: () => Promise.resolve(body),
  });
}

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
  });

  // --- Token management ---
  describe('token management', () => {
    it('getAccessToken returns null when no token set', () => {
      expect(getAccessToken()).toBeNull();
    });

    it('getRefreshToken returns null when no token set', () => {
      expect(getRefreshToken()).toBeNull();
    });

    it('setTokens stores both tokens in localStorage', () => {
      setTokens('access123', 'refresh456');
      expect(getAccessToken()).toBe('access123');
      expect(getRefreshToken()).toBe('refresh456');
    });

    it('clearTokens removes both tokens', () => {
      setTokens('a', 'r');
      clearTokens();
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });

  // --- request behavior via api.auth.me (uses request internally) ---
  describe('request (via api methods)', () => {
    it('adds Authorization header when token exists', async () => {
      setTokens('mytoken', 'myrefresh');
      mockFetch.mockReturnValue(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      await api.auth.me();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer mytoken');
    });

    it('does NOT add Authorization header when no token', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      await api.auth.me();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('returns parsed JSON on success', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      const result = await api.auth.me();
      expect(result.username).toBe('test');
    });

    it('throws on 4xx/5xx errors with status in message', async () => {
      mockFetch.mockReturnValue(errorResponse(404, 'Not found'));

      await expect(api.auth.me()).rejects.toThrow('API 404');
    });

    it('handles 204 No Content via pages.delete', async () => {
      setTokens('t', 'r');
      mockFetch.mockReturnValue(noContentResponse());

      const result = await api.pages.delete('some-id');
      expect(result).toBeUndefined();
    });
  });

  // --- 401 refresh flow ---
  describe('401 token refresh', () => {
    it('refreshes token and retries on 401', async () => {
      setTokens('old_access', 'valid_refresh');

      // First call: 401
      // Second call (refresh): success with new tokens
      // Third call (retry): success
      mockFetch
        .mockReturnValueOnce(errorResponse(401, 'Unauthorized'))
        .mockReturnValueOnce(jsonResponse({ access: 'new_access', refresh: 'new_refresh' }))
        .mockReturnValueOnce(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      const result = await api.auth.me();
      expect(result.username).toBe('test');
      expect(getAccessToken()).toBe('new_access');
    });

    it('clears tokens if refresh fails', async () => {
      setTokens('old_access', 'old_refresh');

      // First call: 401
      // Second call (refresh): also fails
      // After refresh fails, tokens cleared, then the final 401 response also clears
      mockFetch
        .mockReturnValueOnce(errorResponse(401, 'Unauthorized'))
        .mockReturnValueOnce(errorResponse(401, 'Refresh failed'));

      await expect(api.auth.me()).rejects.toThrow('API 401');
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });

  // --- api.auth.login ---
  describe('api.auth.login', () => {
    it('sets tokens on success', async () => {
      mockFetch.mockReturnValue(jsonResponse({ access: 'acc', refresh: 'ref' }));

      await api.auth.login({ username: 'user', password: 'pass' });

      expect(getAccessToken()).toBe('acc');
      expect(getRefreshToken()).toBe('ref');
    });
  });

  // --- api.auth.logout ---
  describe('api.auth.logout', () => {
    it('clears tokens', async () => {
      setTokens('a', 'r');
      await api.auth.logout();
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });

  // --- api.pages.list ---
  describe('api.pages.list', () => {
    it('calls the correct endpoint', async () => {
      mockFetch.mockReturnValue(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

      await api.pages.list();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/pages/');
    });
  });
});

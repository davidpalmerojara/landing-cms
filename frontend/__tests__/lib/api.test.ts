import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api } from '@/lib/api';

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

  // --- Session: cookies only (ADR-008) ---
  describe('request (via api methods)', () => {
    it('sends the session cookies and never an Authorization header', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      await api.auth.me();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.credentials).toBe('include');
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
      mockFetch.mockReturnValue(noContentResponse());

      const result = await api.pages.delete('some-id');
      expect(result).toBeUndefined();
    });
  });

  describe('401 session refresh', () => {
    it('refreshes the session cookie once and retries', async () => {
      mockFetch
        .mockReturnValueOnce(errorResponse(401, 'Unauthorized'))
        .mockReturnValueOnce(jsonResponse({ message: 'Sesión renovada.' }))
        .mockReturnValueOnce(jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' }));

      const result = await api.auth.me();

      expect(result.username).toBe('test');
      const [refreshUrl, refreshOptions] = mockFetch.mock.calls[1];
      expect(refreshUrl).toContain('/auth/refresh/');
      expect(refreshOptions).toMatchObject({ method: 'POST', credentials: 'include' });
      expect(refreshOptions.body).toBeUndefined();
    });

    it('gives up with the original 401 when the refresh fails', async () => {
      mockFetch
        .mockReturnValueOnce(errorResponse(401, 'Unauthorized'))
        .mockReturnValueOnce(errorResponse(401, 'Refresh failed'));

      await expect(api.auth.me()).rejects.toThrow('API 401');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('shares one refresh request between concurrent 401s', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/refresh/')) return jsonResponse({ message: 'ok' });
        const calls = mockFetch.mock.calls.filter(([u]) => !String(u).includes('/auth/refresh/')).length;
        return calls <= 2 ? errorResponse(401) : jsonResponse({ id: '1', email: 'a@b.com', username: 'test', avatar: '', created_at: '' });
      });

      await Promise.all([api.auth.me(), api.auth.me()]);

      const refreshes = mockFetch.mock.calls.filter(([u]) => String(u).includes('/auth/refresh/'));
      expect(refreshes).toHaveLength(1);
    });
  });

  describe('api.auth', () => {
    it('login stores nothing in localStorage', async () => {
      mockFetch.mockReturnValue(jsonResponse({ message: 'Sesión iniciada.' }));

      await api.auth.login({ username: 'user', password: 'pass' });

      expect(localStorage.length).toBe(0);
    });

    it('logout calls the server so the refresh token is revoked', async () => {
      mockFetch.mockReturnValue(jsonResponse({ message: 'Sesión cerrada.' }));

      await api.auth.logout();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/auth/logout/');
      expect(options).toMatchObject({ method: 'POST', credentials: 'include' });
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

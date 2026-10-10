import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve('') });
}

describe('API client, accounts and dashboard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockReturnValue(ok({ count: 0, next: null, previous: null, results: [] }));
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  describe('Accept-Language (QA-054)', () => {
    it('sends the interface language so the server answers in it', async () => {
      document.documentElement.lang = 'en';

      await api.pages.list();

      expect(mockFetch.mock.calls[0][1].headers['Accept-Language']).toBe('en');
    });

    it('follows the language switch', async () => {
      document.documentElement.lang = 'es';
      await api.pages.list();
      document.documentElement.lang = 'en';
      await api.pages.list();

      expect(mockFetch.mock.calls.map(([, init]) => init.headers['Accept-Language'])).toEqual(['es', 'en']);
    });

    it('sends nothing for a language the app does not have', async () => {
      document.documentElement.lang = 'fr';

      await api.pages.list();

      expect(mockFetch.mock.calls[0][1].headers['Accept-Language']).toBeUndefined();
    });
  });

  describe('api.pages.list (QA-016)', () => {
    it('asks for the first page without parameters', async () => {
      await api.pages.list();
      expect(mockFetch.mock.calls[0][0]).toMatch(/\/pages\/$/);
    });

    it('asks for a later page and a search on the server', async () => {
      await api.pages.list({ page: 2, search: ' landing ' });
      expect(mockFetch.mock.calls[0][0]).toMatch(/\/pages\/\?page=2&search=landing$/);
    });
  });
});

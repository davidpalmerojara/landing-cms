import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BACKUPS,
  clearAllBackups,
  discardBackup,
  readBackup,
  writeBackup,
} from '@/lib/page-backup';
import { api } from '@/lib/api';
import { makeBlock, makePage } from '../mobile-editor/test-utils';

/** DATA-008: the local copies of pages must not outlive the session or the access. */
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pageWith = (n: number) => makePage([makeBlock('hero', { title: `Página ${n}` })], { id: idOf(n) });
const keys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
  .filter((key) => key.startsWith('paxl-page-backup:'));

beforeEach(() => {
  localStorage.clear();
  clearAllBackups();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local page backups', () => {
  it('logging out removes every copy, and so does deleting the account', async () => {
    writeBackup(pageWith(1), null);
    writeBackup(pageWith(2), null);
    localStorage.setItem('paxl-locale-hint', 'keep me');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    await api.auth.logout();

    expect(keys()).toEqual([]);
    expect(localStorage.getItem('paxl-locale-hint')).toBe('keep me');

    writeBackup(pageWith(3), null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await api.auth.deleteAccount({ password: 'x' });
    expect(keys()).toEqual([]);
  });

  it('a failed account deletion keeps the copies', async () => {
    writeBackup(pageWith(1), null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"x","code":"INVALID_PASSWORD"}', { status: 400 })));

    await expect(api.auth.deleteAccount({ password: 'wrong' })).rejects.toThrow();

    expect(keys()).toHaveLength(1);
  });

  it('a discarded page is not written again, even by a save that fails afterwards', () => {
    const page = pageWith(1);
    writeBackup(page, null);
    discardBackup(page.id);
    expect(readBackup(page.id)).toBeNull();

    writeBackup(page, null);

    expect(readBackup(page.id)).toBeNull();
  });

  it('keeps the newest copies only', () => {
    vi.useFakeTimers();
    for (let n = 1; n <= MAX_BACKUPS + 3; n++) {
      vi.setSystemTime(new Date(2026, 9, 22, 10, n));
      writeBackup(pageWith(n), null);
    }
    vi.useRealTimers();

    expect(keys()).toHaveLength(MAX_BACKUPS);
    expect(readBackup(idOf(1))).toBeNull();
    expect(readBackup(idOf(3))).toBeNull();
    expect(readBackup(idOf(4))).not.toBeNull();
    expect(readBackup(idOf(MAX_BACKUPS + 3))).not.toBeNull();
  });

  it('rewriting a page that already has a copy never evicts another one', () => {
    for (let n = 1; n <= MAX_BACKUPS; n++) writeBackup(pageWith(n), null);

    writeBackup(pageWith(1), null);
    writeBackup(pageWith(1), null);

    expect(keys()).toHaveLength(MAX_BACKUPS);
  });
});

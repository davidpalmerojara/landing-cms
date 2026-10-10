/**
 * Local copy of the page in localStorage, so nothing typed is lost when a save
 * cannot reach the server (offline, tab closed mid-save, server error).
 *
 * Written on every local edit and after every save, together with the sync
 * base (the server copy the edits started from) and whether the copy has
 * changes the server does not have. On the next load:
 * - the API answers: unsaved changes are merged on top of the server's page
 *   (lib/page-sync, three-way with the stored base);
 * - the API fails: the editor opens the copy and saves it when it can.
 */
import { isBlockId, newBlockId } from '@/lib/block-factory';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { isBlockType, makeBlock } from '@/lib/block-data';
import { samePageContent } from '@/lib/page-merge';
import { defaultBlockStyles } from '@/types/blocks';
import type { Page } from '@/types/page';

const isDev = process.env.NODE_ENV === 'development';

export function logSyncError(message: string, error: unknown) {
  // TODO: replace with centralized client-side error logging when available.
  if (isDev) {
    console.error(message, error);
  }
}

const backupKey = (pageId: string) => `paxl-page-backup:${pageId}`;

/** The server copy the local edits are based on. */
export interface BackupBase {
  page: Page;
  version: number;
}

export interface PageBackup {
  page: Page;
  /** null: unknown (a backup written before the base was stored, or before the first load) */
  base: BackupBase | null;
  /** The page has changes the server did not confirm. Old backups count as unsaved. */
  unsaved: boolean;
  /** When it was written (ms since epoch); 0 when unknown */
  savedAt: number;
}

interface StoredBackup {
  format: 2;
  page: Page;
  base: BackupBase | null;
  unsaved: boolean;
  savedAt: number;
}

/** Saves `page` and the base it is on; `unsaved` is worked out from both. */
export function writeBackup(page: Page, base: BackupBase | null) {
  if (!page.id || page.id.startsWith('page_')) return;
  const stored: StoredBackup = {
    format: 2,
    page,
    base,
    unsaved: base === null || !samePageContent(page, base.page),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(backupKey(page.id), JSON.stringify(stored));
  } catch (e) {
    logSyncError('Could not write local page backup:', e);
  }
}

/** Forget the copy (access to the page was removed). */
export function clearBackup(pageId: string) {
  try {
    localStorage.removeItem(backupKey(pageId));
  } catch (e) {
    logSyncError('Could not remove local page backup:', e);
  }
}

/** A page read from storage, normalized like API data; null when it is not a page with that id. */
function normalizeStoredPage(raw: unknown, pageId: string): Page | null {
  const parsed = raw as Page | null;
  if (!parsed || parsed.id !== pageId || !Array.isArray(parsed.blocks)) return null;
  return {
    ...parsed,
    // Backups written before design tokens were the only theme have none
    designTokens: parsed.designTokens ?? cloneDesignTokens(defaultDesignTokens),
    // Backups written before ADR-014 may hold non-UUID block ids, and older
    // ones numbered list keys: data is normalized like API data.
    blocks: parsed.blocks.flatMap((b) => {
      if (!isBlockType(b.type)) return [];
      const base = {
        id: isBlockId(b.id) ? b.id : newBlockId(),
        name: b.name,
        styles: b.styles || { ...defaultBlockStyles },
        responsiveStyles: b.responsiveStyles,
      };
      return [makeBlock(base, b.type, b.data)];
    }),
  };
}

function isStoredBackup(value: unknown): value is StoredBackup {
  return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 2;
}

export function readBackup(pageId: string): PageBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(pageId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredBackup(parsed)) {
      // First format: the page alone
      const page = normalizeStoredPage(parsed, pageId);
      return page ? { page, base: null, unsaved: true, savedAt: 0 } : null;
    }
    const page = normalizeStoredPage(parsed.page, pageId);
    if (!page) return null;
    const basePage = parsed.base ? normalizeStoredPage(parsed.base.page, pageId) : null;
    const base = basePage && typeof parsed.base?.version === 'number'
      ? { page: basePage, version: parsed.base.version }
      : null;
    return { page, base, unsaved: parsed.unsaved !== false, savedAt: Number(parsed.savedAt) || 0 };
  } catch (e) {
    logSyncError('Could not read local page backup:', e);
    return null;
  }
}

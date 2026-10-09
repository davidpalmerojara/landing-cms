/**
 * Local copy of the page in localStorage, used only when the API is unreachable.
 */
import { isBlockId, newBlockId } from '@/lib/block-factory';
import { cloneDesignTokens, defaultDesignTokens } from '@/lib/design-tokens';
import { isBlockType, makeBlock } from '@/lib/block-data';
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

export function writeBackup(page: Page) {
  try {
    localStorage.setItem(backupKey(page.id), JSON.stringify(page));
  } catch (e) {
    logSyncError('Could not write local page backup:', e);
  }
}

export function readBackup(pageId: string): Page | null {
  try {
    const raw = localStorage.getItem(backupKey(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Page;
    if (parsed?.id !== pageId || !Array.isArray(parsed.blocks)) return null;
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
  } catch (e) {
    logSyncError('Could not read local page backup:', e);
    return null;
  }
}

'use client';

import { useCallback, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { flushPendingSave } from '@/lib/save-flush';

/**
 * A link out of the editor that saves first (QA-003): the pending autosave is
 * sent and awaited before navigating. If it fails, the caller asks whether to
 * leave anyway (the change stays in this browser's backup and comes back on
 * the next visit). Clicks that open a new tab are left to the browser.
 */
export function useLeaveEditor(href: string) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onLinkClick = useCallback(async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setIsLeaving(true);
    const saved = await flushPendingSave();
    setIsLeaving(false);
    if (saved) router.push(href);
    else setConfirmOpen(true);
  }, [href, router]);

  const leaveAnyway = useCallback(() => {
    setConfirmOpen(false);
    router.push(href);
  }, [href, router]);

  const stay = useCallback(() => setConfirmOpen(false), []);

  return { onLinkClick, isLeaving, confirmOpen, leaveAnyway, stay };
}

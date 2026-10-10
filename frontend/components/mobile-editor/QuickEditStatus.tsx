'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, Pencil, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSaveIssueText } from '@/hooks/useSaveIssueText';
import { useEditorStore, getUserColor, uniquePresenceUsers } from '@/store/editor-store';
import { presenceInitials } from '@/lib/collab-names';

/** Whether the browser says it is online; only for what the status line says (saving retries on its own). */
function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return isOnline;
}

/** Longer than the autosave wait (3 s): a save that never starts (nothing left to send) must not leave the label up */
const PENDING_EDIT_MAX_MS = 6000;

/**
 * Whether this person edited the page and the save has not started yet: the
 * autosave waits a few seconds after the last edit (MOBILE2-012). Changes
 * that arrive from other people are not this person's to wait for.
 */
function useHasPendingEdit(): boolean {
  const [hasPendingEdit, setHasPendingEdit] = useState(false);
  useEffect(() => {
    let giveUp: ReturnType<typeof setTimeout> | null = null;
    const stopWaiting = () => {
      if (giveUp) clearTimeout(giveUp);
      giveUp = null;
      setHasPendingEdit(false);
    };
    const unsubscribeEdits = useEditorStore.subscribe(
      (s) => s.page,
      (page, previous) => {
        if (page === previous || useEditorStore.getState().isRemoteUpdate) return;
        setHasPendingEdit(true);
        if (giveUp) clearTimeout(giveUp);
        giveUp = setTimeout(stopWaiting, PENDING_EDIT_MAX_MS);
      },
    );
    // The save started or failed: the wait is over
    const unsubscribeStatus = useEditorStore.subscribe(
      (s) => s.autoSaveStatus,
      (status) => {
        if (status === 'saving' || status === 'error') stopWaiting();
      },
    );
    return () => {
      unsubscribeEdits();
      unsubscribeStatus();
      if (giveUp) clearTimeout(giveUp);
    };
  }, []);
  return hasPendingEdit;
}

/**
 * The line under the page name in Quick Edit (QA-125): the autosave state in
 * words at 12 px with its icon, from the shared save controller (QA-008), and
 * who else is editing (QA-073).
 */
export default function QuickEditStatus() {
  const t = useTranslations();
  const isOnline = useIsOnline();
  const hasPendingEdit = useHasPendingEdit();
  const { status, issue, text } = useSaveIssueText();
  const presence = useEditorStore((s) => s.presence);
  const myUserId = useEditorStore((s) => s.myUserId);
  const others = useMemo(
    () => uniquePresenceUsers(presence).filter((user) => user.userId !== myUserId),
    [myUserId, presence],
  );

  let Icon: typeof Check | null = null;
  let label = '';
  let tone = 'text-secondary';
  if (text && issue) {
    Icon = issue.kind === 'failed' && issue.error === 'offline' ? CloudOff : AlertTriangle;
    label = text.short;
    tone = 'text-error';
  } else if (!isOnline) {
    Icon = WifiOff;
    label = t('mobile.offline');
    tone = 'text-warning';
  } else if (hasPendingEdit && status !== 'saving') {
    Icon = Pencil;
    label = t('mobile.unsaved');
  } else if (status === 'saving') {
    Icon = Loader2;
    label = t('mobile.saving');
  } else if (status === 'saved') {
    Icon = Check;
    label = t('mobile.saved');
    tone = 'text-success';
  }

  return (
    <div className="flex items-center justify-center gap-2 min-w-0 h-5">
      <p role="status" className={`flex items-center gap-1 min-w-0 text-xs font-medium ${tone}`}>
        {Icon && <Icon size={13} aria-hidden="true" className={`shrink-0 ${Icon === Loader2 ? 'animate-spin' : ''}`} />}
        <span className="truncate">{label}</span>
      </p>
      {others.length > 0 && (
        <div
          role="img"
          aria-label={t('mobile.presenceLabel', { names: others.map((user) => user.username).join(', ') })}
          className="flex items-center -space-x-1.5 shrink-0"
        >
          {others.slice(0, 3).map((user) => (
            <span
              key={user.userId}
              aria-hidden="true"
              className="w-5 h-5 rounded-full ring-1 ring-surface flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: getUserColor(user.userId).hex }}
            >
              {presenceInitials(user.username)}
            </span>
          ))}
          {others.length > 3 && (
            <span aria-hidden="true" className="pl-2 text-[11px] text-secondary">+{others.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

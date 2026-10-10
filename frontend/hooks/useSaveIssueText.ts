'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEditorStore } from '@/store/editor-store';
import { apiErrorKindMessage } from '@/lib/api-errors';
import { describeRejectedField } from '@/lib/save-issue';
import type { SaveIssue } from '@/lib/page-sync';

export interface SaveIssueText {
  /** A few words for the top bar ("Sin conexión", "1 campo sin guardar") */
  short: string;
  /** The whole explanation: what failed, what happens next */
  full: string;
}

/**
 * The autosave state and, when the last save went wrong, what to tell the
 * user about it (QA-004): "offline" only when the server could not be reached;
 * a refused field is named with its rule.
 */
export function useSaveIssueText() {
  const t = useTranslations();
  const locale = useLocale();
  const status = useEditorStore((s) => s.autoSaveStatus);
  const issue = useEditorStore((s) => s.saveIssue);

  const describe = (current: SaveIssue): SaveIssueText => {
    if (current.kind === 'rejected') {
      const { label, message } = describeRejectedField(current.fields[0], t, locale);
      return {
        short: t('saveStatus.rejectedShort', { count: current.fields.length }),
        full: t('saveStatus.rejected', { field: label, message, others: current.fields.length - 1 }),
      };
    }
    if (current.error === 'offline') {
      return { short: t('saveStatus.offlineShort'), full: t('saveStatus.offline') };
    }
    const reason = apiErrorKindMessage(current.error, t, 'saveStatus.failedUnknown');
    return {
      short: t('saveStatus.failedShort'),
      full: current.retrying ? t('saveStatus.failedRetrying', { reason }) : t('saveStatus.failed', { reason }),
    };
  };

  const text = status === 'error' && issue ? describe(issue) : null;
  return { status, issue, text };
}

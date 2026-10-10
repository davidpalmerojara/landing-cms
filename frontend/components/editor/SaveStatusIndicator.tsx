'use client';

import { AlertCircle, CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSaveIssueText } from '@/hooks/useSaveIssueText';
import type { RejectedField, SaveIssue } from '@/lib/page-sync';

interface SaveIssueActions {
  /** Send the failed save again now */
  onRetry: () => void;
  /** Take the user to a field the server refused */
  onShowField: (field: RejectedField) => void;
}

function IssueIcon({ issue, className }: { issue: SaveIssue; className: string }) {
  return issue.kind === 'failed' && issue.error === 'offline'
    ? <CloudOff className={className} aria-hidden="true" />
    : <AlertCircle className={className} aria-hidden="true" />;
}

/**
 * Autosave state in one line of the top bar (QA-083): "Guardando…", "Guardado",
 * or a short note of what went wrong. Below the xl breakpoint only the icon
 * shows; the full text stays for screen readers and in the banner.
 */
export default function SaveStatusIndicator({ onRetry, onShowField }: SaveIssueActions) {
  const t = useTranslations();
  const { status, issue, text } = useSaveIssueText();

  return (
    <div role="status" className="flex items-center min-w-0 shrink-0 text-[11px] whitespace-nowrap">
      {status === 'saving' && (
        <span className="flex items-center gap-1 text-secondary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span className="sr-only xl:not-sr-only">{t('common.saving')}</span>
        </span>
      )}
      {status === 'saved' && (
        <span className="flex items-center gap-1 text-primary-color">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only xl:not-sr-only">{t('common.saved')}</span>
        </span>
      )}
      {text && issue && (
        <button
          type="button"
          onClick={() => (issue.kind === 'rejected' ? onShowField(issue.fields[0]) : onRetry())}
          title={text.full}
          className="flex items-center gap-1 text-error rounded-md px-1.5 py-1 hover:bg-error/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <IssueIcon issue={issue} className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline" aria-hidden="true">{text.short}</span>
          <span className="sr-only">{text.full}</span>
        </button>
      )}
    </div>
  );
}

/**
 * The whole explanation of a save problem, under the top bar, with the way
 * out: go to the refused field, or retry now. Announced by the status above.
 */
export function SaveIssueBanner({ onRetry, onShowField }: SaveIssueActions) {
  const t = useTranslations();
  const { issue, text } = useSaveIssueText();
  if (!issue || !text) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-[12px] bg-error/10 border-b border-error/30 text-primary shrink-0">
      <IssueIcon issue={issue} className="w-4 h-4 text-error shrink-0" />
      <p className="flex-1 min-w-0">{text.full}</p>
      <button
        type="button"
        onClick={() => (issue.kind === 'rejected' ? onShowField(issue.fields[0]) : onRetry())}
        className="shrink-0 font-semibold text-primary-color hover:underline rounded-md px-2 py-1 min-h-8 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        {issue.kind === 'rejected' ? t('saveStatus.showField') : t('saveStatus.retryNow')}
      </button>
    </div>
  );
}

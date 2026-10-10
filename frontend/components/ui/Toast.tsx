'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useIsAnySheetOpen } from '@/hooks/useCloseOnBack';

/** A button in the toast that undoes or follows up what it announces ("Deshacer"). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const MIN_VISIBLE_MS = 4000;
const MAX_VISIBLE_MS = 10_000;
/** Roughly reading speed: a long message stays longer than a short one */
const MS_PER_CHARACTER = 60;
const CHARACTERS_READ_IN_MIN = 40;
/** A toast with a button leaves time to reach it */
const MIN_WITH_ACTION_MS = 6000;

/**
 * How long a toast stays on screen, or null when it stays until dismissed
 * (QA-068): errors must be read and may need acting on; the others last by
 * their length, between 4 and 10 seconds.
 */
export function toastDuration(toast: Pick<ToastData, 'message' | 'variant' | 'action'>): number | null {
  if (toast.variant === 'error') return null;
  const byLength = MIN_VISIBLE_MS + Math.max(0, toast.message.length - CHARACTERS_READ_IN_MIN) * MS_PER_CHARACTER;
  const min = toast.action ? MIN_WITH_ACTION_MS : MIN_VISIBLE_MS;
  return Math.min(MAX_VISIBLE_MS, Math.max(min, byLength));
}

function Toast({ toast, onDismiss }: ToastProps) {
  const t = useTranslations();
  // Hovering or focusing the toast keeps it (WCAG 2.2.1: time to read and act)
  const [isHeld, setIsHeld] = useState(false);
  const duration = toastDuration(toast);

  useEffect(() => {
    if (duration === null || isHeld) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, duration, isHeld]);

  const Icon = toast.variant === 'success' ? CheckCircle2
    : toast.variant === 'error' ? AlertCircle
    : Info;

  return (
    <div
      data-variant={toast.variant}
      onPointerEnter={() => setIsHeld(true)}
      onPointerLeave={() => setIsHeld(false)}
      onFocus={() => setIsHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsHeld(false);
      }}
      className={clsx(
        // Opaque: nothing underneath shows through the text (QA-068)
        'pointer-events-auto flex items-center gap-2 pl-4 pr-1 py-1 rounded-lg shadow-xl border text-sm font-medium animate-in fade-in slide-in-from-bottom-2',
        toast.variant === 'success' && 'bg-emerald-950 border-emerald-800 text-emerald-200',
        toast.variant === 'error' && 'bg-red-950 border-red-800 text-red-200',
        toast.variant === 'info' && 'bg-surface-elevated border-primary/50 text-primary',
      )}
    >
      <Icon aria-hidden="true" className={clsx('w-4 h-4 shrink-0', toast.variant === 'info' && 'text-primary-color')} />
      <span className="flex-1 py-2">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 min-h-11 px-3 rounded-md font-semibold underline underline-offset-2 hover:bg-current/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 text-current opacity-70 hover:opacity-100 p-1.5 min-w-11 min-h-11 flex items-center justify-center" aria-label={t('common.close')}>
        <X aria-hidden="true" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  /**
   * `aboveFab`: across the bottom of a phone screen, clear of the floating
   * "+" button and the home indicator (Quick Edit). While a sheet, the media
   * library, a confirmation or the preview is open there is no "+" and the
   * bottom is where the person works, so the toasts move to the top, over the
   * dimmed toolbar (MOBILE2-004). `corner`: bottom right.
   */
  placement?: 'corner' | 'aboveFab';
}

export function ToastContainer({ toasts, onDismiss, placement: requestedPlacement = 'corner' }: ToastContainerProps) {
  const isSheetOpen = useIsAnySheetOpen();
  const placement = requestedPlacement === 'aboveFab' && isSheetOpen ? 'top' : requestedPlacement;
  // The live region stays mounted so screen readers announce the first toast too
  return (
    <div
      data-placement={placement}
      className={clsx(
        'fixed z-[9999] flex flex-col gap-2 pointer-events-none',
        placement === 'corner' && 'right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] max-w-[calc(100vw-2rem)]',
        // The FAB is 56 px high and 24 px from the bottom edge
        placement === 'aboveFab' && 'left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] items-stretch',
        // The toolbar is 64 px high and sheets start under it
        placement === 'top' && 'left-4 right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] items-stretch',
      )}
      aria-live="polite"
    >
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

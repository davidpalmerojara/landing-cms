'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';

export interface ToastData {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const t = useTranslations();
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon = toast.variant === 'success' ? CheckCircle2
    : toast.variant === 'error' ? AlertCircle
    : Info;

  return (
    <div className={clsx(
      'flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium animate-in fade-in slide-in-from-bottom-2',
      toast.variant === 'success' && 'bg-emerald-950/90 border-emerald-800 text-emerald-200',
      toast.variant === 'error' && 'bg-red-950/90 border-red-800 text-red-200',
      toast.variant === 'info' && 'bg-primary\/10 border-[#2563EB]/30 text-primary-color',
    )}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="text-current opacity-50 hover:opacity-100 p-1.5 min-w-11 min-h-11 flex items-center justify-center" aria-label={t('common.close')}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2" aria-live="polite">
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

'use client';

import { Lock } from 'lucide-react';
import { useGuestSession } from './GuestSessionProvider';

interface GuestFeatureNoticeProps {
  title: string;
  description: string;
  actionLabel: string;
  className?: string;
}

/** Explains why a feature is off in a guest session and offers the account that unlocks it. */
export default function GuestFeatureNotice({ title, description, actionLabel, className = '' }: GuestFeatureNoticeProps) {
  const { openClaim } = useGuestSession();

  return (
    <div className={`flex flex-col items-center text-center gap-3 px-6 py-10 bg-surface-elevated/50 border border-subtle/80 rounded-xl ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-surface-card border border-default/15 flex items-center justify-center">
        <Lock className="w-5 h-5 text-muted" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      <p className="text-sm text-muted max-w-sm leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={openClaim}
        className="mt-1 min-h-11 px-5 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-bold transition-all active:scale-95"
      >
        {actionLabel}
      </button>
    </div>
  );
}

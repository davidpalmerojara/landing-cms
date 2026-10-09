'use client';

import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { guestHoursLeft } from '@/lib/guest';
import { useGuestSession } from './GuestSessionProvider';

/** Always-visible notice that this is a temporary session, with the way to keep the work. */
export default function GuestBanner({ className }: { className?: string }) {
  const t = useTranslations();
  const { isGuest, expiresAt, openClaim } = useGuestSession();

  if (!isGuest) return null;

  const hoursLeft = guestHoursLeft(expiresAt);

  return (
    <div
      role="region"
      aria-label={t('guest.bannerLabel')}
      className={clsx(
        'shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-warning/10 border-b border-warning/30 text-sm',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-primary">
        <Clock className="w-4 h-4 shrink-0 text-warning" aria-hidden="true" />
        <span>{t('guest.bannerText')}</span>
        {hoursLeft !== null && (
          <span className="text-muted whitespace-nowrap">
            {hoursLeft === 0 ? t('guest.expiringNow') : t('guest.expiresIn', { hours: hoursLeft })}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={openClaim}
        className="min-h-11 px-4 rounded-full bg-primary hover:bg-primary-dark text-white text-xs font-bold transition-all active:scale-95"
      >
        {t('guest.claimAction')}
      </button>
    </div>
  );
}

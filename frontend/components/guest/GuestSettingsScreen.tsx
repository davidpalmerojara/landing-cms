'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ApiUser } from '@/lib/api';
import GuestFeatureNotice from './GuestFeatureNotice';
import GuestSessionProvider from './GuestSessionProvider';

interface GuestSettingsScreenProps {
  user: ApiUser;
  onClaimed: (user: ApiUser) => void;
  title: string;
  description: string;
  /** Where the back arrow goes */
  backHref?: string;
}

/** Stands in for a settings page whose feature a guest session does not have. */
export default function GuestSettingsScreen({ user, onClaimed, title, description, backHref = '/settings' }: GuestSettingsScreenProps) {
  const t = useTranslations();

  return (
    <GuestSessionProvider user={user} onClaimed={onClaimed}>
      <div className="min-h-screen bg-surface text-secondary">
        <header className="border-b border-subtle/80">
          <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
            <Link
              href={backHref}
              aria-label={t('common.back')}
              className="w-11 h-11 flex items-center justify-center text-muted hover:text-secondary rounded-md hover:bg-surface-card/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </Link>
            <span className="text-xl font-black tracking-tighter text-primary-color">{t('common.brand')}</span>
          </div>
        </header>
        <main id="main-content" className="max-w-3xl mx-auto px-6 py-10">
          <GuestFeatureNotice title={title} description={description} actionLabel={t('guest.claimAction')} />
        </main>
      </div>
    </GuestSessionProvider>
  );
}

'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ApiUser } from '@/lib/api';
import DeleteAccountDialog from '@/components/settings/DeleteAccountDialog';

/** Settings section with the way to delete the account. Not for guests: their account deletes itself. */
export default function DeleteAccountSection({ user }: { user: ApiUser }) {
  const t = useTranslations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (user.is_guest) return null;

  return (
    <section aria-labelledby="delete-account-heading" className="mt-10">
      <h2 id="delete-account-heading" className="text-sm font-semibold text-error mb-3">
        {t('settingsPage.deleteAccount.sectionTitle')}
      </h2>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 bg-error/5 border border-error/20 rounded-xl">
        <div className="w-10 h-10 bg-error/10 border border-error/20 rounded-lg flex items-center justify-center shrink-0">
          <Trash2 className="w-5 h-5 text-error" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-primary">{t('settingsPage.deleteAccount.title')}</h3>
          <p className="text-xs text-muted mt-0.5">{t('settingsPage.deleteAccount.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          aria-haspopup="dialog"
          className="min-h-11 px-4 rounded-lg border border-error/40 text-error text-sm font-medium hover:bg-error/10 transition-colors shrink-0"
        >
          {t('settingsPage.deleteAccount.button')}
        </button>
      </div>

      {isDialogOpen && <DeleteAccountDialog user={user} onCancel={() => setIsDialogOpen(false)} />}
    </section>
  );
}

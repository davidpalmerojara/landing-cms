'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import type { ApiUser } from '@/lib/api';

/** Why the deletion did not happen; each one has its own message. */
export type DeleteAccountError = 'invalidPassword' | 'usernameMismatch' | 'activeSubscription' | 'tooManyAttempts' | 'generic';

function toDeleteAccountError(error: unknown): DeleteAccountError {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.code === 'INVALID_PASSWORD') return 'invalidPassword';
  if (error.code === 'CONFIRMATION_MISMATCH') return 'usernameMismatch';
  if (error.code === 'ACTIVE_SUBSCRIPTION') return 'activeSubscription';
  if (error.status === 429) return 'tooManyAttempts';
  return 'generic';
}

/**
 * Deletes the signed-in person's account. Accounts with a password confirm
 * with it; the rest (magic link, Google) by typing their username. When the
 * server has deleted the account the person is taken to the landing page, which tells them it is done (QA-120).
 */
export function useDeleteAccount(user: ApiUser) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);

  const confirmationKind: 'password' | 'username' = user.has_password ? 'password' : 'username';

  const clearError = useCallback(() => setError(null), []);

  const deleteAccount = useCallback(async (confirmation: string) => {
    setIsDeleting(true);
    setError(null);
    try {
      await api.auth.deleteAccount(confirmationKind === 'password' ? { password: confirmation } : { confirm_username: confirmation });
    } catch (e) {
      const kind = toDeleteAccountError(e);
      if (kind === 'generic' && process.env.NODE_ENV === 'development') console.error('Deleting the account failed:', e);
      setError(kind);
      setIsDeleting(false);
      return;
    }
    // The session cookies are gone: leave without asking for the profile again
    router.replace('/?deleted=1');
  }, [confirmationKind, router]);

  return { confirmationKind, isDeleting, error, clearError, deleteAccount };
}

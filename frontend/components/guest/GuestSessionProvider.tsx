'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiUser } from '@/lib/api';
import ClaimGuestDialog from './ClaimGuestDialog';

interface GuestSession {
  isGuest: boolean;
  /** When the guest session is deleted (ISO date), or null */
  expiresAt: string | null;
  /** Opens the dialog that turns the guest into a real account */
  openClaim: () => void;
}

const GuestSessionContext = createContext<GuestSession>({
  isGuest: false,
  expiresAt: null,
  openClaim: () => undefined,
});

export function useGuestSession(): GuestSession {
  return useContext(GuestSessionContext);
}

interface GuestSessionProviderProps {
  user: ApiUser | null;
  /** The guest created its account: replace the user so the guest UI goes away */
  onClaimed: (user: ApiUser) => void;
  children: ReactNode;
}

/**
 * Tells the page below whether the session is a guest one and hosts the claim
 * dialog, so any component (banner, asset picker, settings notice) can open it.
 */
export default function GuestSessionProvider({ user, onClaimed, children }: GuestSessionProviderProps) {
  const [claimOpen, setClaimOpen] = useState(false);
  const openClaim = useCallback(() => setClaimOpen(true), []);

  const isGuest = Boolean(user?.is_guest);
  const expiresAt = user?.expires_at ?? null;
  const value = useMemo(() => ({ isGuest, expiresAt, openClaim }), [isGuest, expiresAt, openClaim]);

  return (
    <GuestSessionContext.Provider value={value}>
      {children}
      {claimOpen && (
        <ClaimGuestDialog
          onCancel={() => setClaimOpen(false)}
          onClaimed={(claimed) => {
            setClaimOpen(false);
            onClaimed(claimed);
          }}
        />
      )}
    </GuestSessionContext.Provider>
  );
}

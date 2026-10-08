'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiUser } from '@/lib/api';

export function useAuth({ redirectTo }: { redirectTo?: string } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        // The httpOnly session cookie is sent automatically (ADR-008);
        // an expired access token is refreshed once inside the API client.
        const me = await api.auth.me();
        setUser(me);
      } catch {
        // No valid session
        if (redirectTo) router.replace(redirectTo);
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, [redirectTo, router]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      // Still leave the app; the server-side session expires on its own
      if (process.env.NODE_ENV === 'development') console.error('Logout request failed:', e);
    }
    setUser(null);
    router.replace('/login');
  }, [router]);

  return { user, isLoading, logout };
}

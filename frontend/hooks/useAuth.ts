'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getAccessToken, clearTokens } from '@/lib/api';
import type { ApiUser } from '@/lib/api';

export function useAuth({ redirectTo }: { redirectTo?: string } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        // Cookie-first: always try /auth/me/ with credentials: 'include'.
        // fetchWithRetry sends the httpOnly cookie automatically and falls
        // back to the localStorage token if present (ADR-008).
        const me = await api.auth.me();
        setUser(me);
      } catch {
        clearTokens();
        if (redirectTo) router.replace(redirectTo);
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, [redirectTo, router]);

  const logout = useCallback(() => {
    api.auth.logout();
    setUser(null);
    router.replace('/login');
  }, [router]);

  return { user, isLoading, logout };
}

'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiCustomDomain, ApiPageListItem } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

/** A domain as the settings page shows it: the API fields plus a verification error from this session */
export type DomainWithError = ApiCustomDomain & { dns_error?: string };

interface DomainSettings {
  domains: DomainWithError[];
  pages: ApiPageListItem[];
  /** The plan includes custom domains; null while the plan is unknown */
  isPro: boolean | null;
}

const EMPTY_SETTINGS: DomainSettings = { domains: [], pages: [], isPro: null };

async function loadDomainSettings(): Promise<DomainSettings> {
  const [domainRes, pagesRes] = await Promise.all([api.domains.list(), api.pages.list()]);
  let isPro = false;
  try {
    const sub = await api.billing.subscription();
    isPro = sub.subscription?.plan?.has_custom_domain ?? false;
  } catch (e) {
    // Without a known plan the page treats the account as free and offers the upgrade
    if (process.env.NODE_ENV === 'development') console.error('Failed to load the plan:', e);
  }
  return { domains: domainRes.results, pages: pagesRes.results, isPro };
}

/**
 * Domains, the user's pages (to assign one) and whether the plan allows custom
 * domains. With `enabled` false (guests, who cannot have domains) nothing is requested.
 */
export function useDomainSettings({ enabled }: { enabled: boolean }) {
  const load = useCallback(
    () => (enabled ? loadDomainSettings() : Promise.resolve(EMPTY_SETTINGS)),
    [enabled],
  );
  const { data, isLoading, hasError, error, reload, update } = useAsyncData(load);
  const settings = data ?? EMPTY_SETTINGS;

  const updateDomains = useCallback(
    (change: (current: DomainWithError[]) => DomainWithError[]) =>
      update((current) => ({ ...current, domains: change(current.domains) })),
    [update],
  );

  return {
    domains: settings.domains,
    pages: settings.pages,
    isPro: settings.isPro,
    isLoading,
    hasError,
    error,
    reload,
    updateDomains,
  };
}

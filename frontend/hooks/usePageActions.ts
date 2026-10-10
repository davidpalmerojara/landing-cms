'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { ApiPageListItem } from '@/lib/api';
import { accountErrorKey } from '@/lib/account-errors';
import { buildPagePayload } from '@/lib/templates';

interface UsePageActionsOptions {
  /** The pages or the totals changed on the server: load them again */
  onChanged: () => void;
  updatePages: (change: (pages: ApiPageListItem[]) => ApiPageListItem[]) => void;
  /** Whether upgrading is possible here: decides how the plan-limit message ends */
  billingEnabled: boolean;
}

/**
 * What the dashboard does with pages: create from a template, duplicate,
 * unpublish and delete. Failures become translated messages (never the raw
 * `API 500: {...}` text); a failed create is kept apart because it is shown
 * inside the template dialog, which would otherwise hide it.
 */
export function usePageActions({ onChanged, updatePages, billingEnabled }: UsePageActionsOptions) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const messageFor = useCallback((error: unknown, fallbackKey: string) => {
    const key = accountErrorKey(error) ?? fallbackKey;
    // "Upgrade to Pro" is no way out when this deployment takes no payments
    return t(key === 'dashboard.planLimit' && !billingEnabled ? 'dashboard.planLimitDemo' : key);
  }, [t, billingEnabled]);

  const clearErrors = useCallback(() => {
    setActionError(null);
    setCreateError(null);
  }, []);

  const createFromTemplate = useCallback(async (templateId: string | null) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const page = await api.pages.create(buildPagePayload(templateId, t('dashboard.createUntitled'), locale));
      router.push(`/editor/${page.id}`);
    } catch (error) {
      setCreateError(messageFor(error, 'dashboard.createError'));
      setIsCreating(false);
    }
  }, [locale, messageFor, router, t]);

  const duplicate = useCallback(async (id: string) => {
    setActionError(null);
    try {
      await api.pages.duplicate(id);
      onChanged();
    } catch (error) {
      setActionError(messageFor(error, 'dashboard.duplicateError'));
    }
  }, [messageFor, onChanged]);

  const unpublish = useCallback(async (id: string) => {
    setActionError(null);
    try {
      const updated = await api.pages.unpublish(id);
      updatePages((pages) => pages.map((page) => (
        page.id === id ? { ...page, status: updated.status, has_unpublished_changes: false } : page
      )));
      onChanged();
    } catch (error) {
      setActionError(messageFor(error, 'dashboard.unpublishError'));
    }
  }, [messageFor, onChanged, updatePages]);

  const remove = useCallback(async (id: string) => {
    setActionError(null);
    try {
      await api.pages.delete(id);
      updatePages((pages) => pages.filter((page) => page.id !== id));
      onChanged();
    } catch (error) {
      setActionError(messageFor(error, 'dashboard.deleteError'));
    }
  }, [messageFor, onChanged, updatePages]);

  return { actionError, createError, isCreating, clearErrors, createFromTemplate, duplicate, unpublish, remove };
}

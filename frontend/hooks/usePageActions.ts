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
  // The last action failed because the session is gone: the dashboard offers the way back to log in (APP2-012)
  const [sessionExpired, setSessionExpired] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const messageFor = useCallback((error: unknown, fallbackKey: string) => {
    const key = accountErrorKey(error) ?? fallbackKey;
    // "Upgrade to Pro" is no way out when this deployment takes no payments
    return t(key === 'dashboard.planLimit' && !billingEnabled ? 'dashboard.planLimitDemo' : key);
  }, [t, billingEnabled]);

  const failAction = useCallback((error: unknown, fallbackKey: string) => {
    setActionError(messageFor(error, fallbackKey));
    setSessionExpired(accountErrorKey(error) === 'errors.unauthorized');
  }, [messageFor]);

  const clearErrors = useCallback(() => {
    setActionError(null);
    setSessionExpired(false);
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
    clearErrors();
    try {
      await api.pages.duplicate(id);
      onChanged();
    } catch (error) {
      failAction(error, 'dashboard.duplicateError');
    }
  }, [clearErrors, failAction, onChanged]);

  const unpublish = useCallback(async (id: string) => {
    clearErrors();
    try {
      const updated = await api.pages.unpublish(id);
      updatePages((pages) => pages.map((page) => (
        page.id === id ? { ...page, status: updated.status, has_unpublished_changes: false } : page
      )));
      onChanged();
    } catch (error) {
      failAction(error, 'dashboard.unpublishError');
    }
  }, [clearErrors, failAction, onChanged, updatePages]);

  const remove = useCallback(async (id: string) => {
    clearErrors();
    try {
      await api.pages.delete(id);
      updatePages((pages) => pages.filter((page) => page.id !== id));
      onChanged();
    } catch (error) {
      failAction(error, 'dashboard.deleteError');
    }
  }, [clearErrors, failAction, onChanged, updatePages]);

  return { actionError, sessionExpired, createError, isCreating, clearErrors, createFromTemplate, duplicate, unpublish, remove };
}

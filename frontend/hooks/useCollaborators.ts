'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';

export interface Collaborator {
  id: string;
  username: string;
  email: string;
}

const NO_COLLABORATORS: Collaborator[] = [];

/** The owner of a page and the people it is shared with. */
export function useCollaborators(pageId: string) {
  const load = useCallback(() => api.pages.collaborators(pageId), [pageId]);
  const { data, isLoading, hasError, reload } = useAsyncData(load);

  return {
    owner: data?.owner ?? null,
    collaborators: data?.collaborators ?? NO_COLLABORATORS,
    /** Only the first load: reloading after an invite keeps the list on screen */
    isLoading: isLoading && data === null && !hasError,
    hasError,
    reload,
  };
}

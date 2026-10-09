'use client';

import { createContext, useContext } from 'react';

/**
 * Whether block links navigate. True on the public page and the standalone
 * /preview page; false (default) inside the editor, where previews (preview
 * toggle, version comparison, mobile fullscreen preview) must not take the
 * user away from their work.
 */
const LiveLinksContext = createContext(false);

export const LiveLinksProvider = LiveLinksContext.Provider;

export function useLiveLinks(): boolean {
  return useContext(LiveLinksContext);
}

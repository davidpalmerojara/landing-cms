'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether the images of a block load at once or when they come near the
 * screen (PERF-002, MOBILE-004). Lazy by default; the renderer marks the
 * first blocks of a page eager, since they are what the visitor sees first
 * (a phone downloaded every gallery photo before the hero: LCP 7.4 s).
 */
const ImagePriorityContext = createContext<boolean>(false);

/** How many blocks at the top of a page get their images at once. */
export const EAGER_IMAGE_BLOCKS = 2;

export function ImagePriorityProvider({ eager, children }: { eager: boolean; children: ReactNode }) {
  return <ImagePriorityContext.Provider value={eager}>{children}</ImagePriorityContext.Provider>;
}

/** True inside one of the first blocks of a page. */
export function useEagerImages(): boolean {
  return useContext(ImagePriorityContext);
}

/** The `<img>` attributes for that priority. */
export function imageLoadingProps(eager: boolean) {
  return eager
    ? { loading: 'eager' as const, decoding: 'async' as const, fetchPriority: 'high' as const }
    : { loading: 'lazy' as const, decoding: 'async' as const };
}

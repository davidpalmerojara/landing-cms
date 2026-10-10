/** Viewport width breakpoint (px) below which the editor switches to Quick Edit Mode. */
export const QUICK_EDIT_BREAKPOINT = 768;

/**
 * Height (px) up to which a touch screen counts as a phone held sideways: a
 * phone in landscape is wider than the breakpoint (an iPhone is 844 px) but
 * only about 390 px high, too little for the full editor. Tablets are at
 * least 768 px high in landscape, so they keep the full editor (D4).
 */
export const QUICK_EDIT_LANDSCAPE_MAX_HEIGHT = 500;

/**
 * Phones get Quick Edit: any viewport narrower than the breakpoint, and a
 * short touch screen (a phone in landscape). Everything else, tablets
 * included, gets the full editor (QA-022).
 */
export const QUICK_EDIT_MEDIA_QUERY =
  `(max-width: ${QUICK_EDIT_BREAKPOINT - 1}px), (pointer: coarse) and (max-height: ${QUICK_EDIT_LANDSCAPE_MAX_HEIGHT}px)`;

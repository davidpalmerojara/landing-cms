/**
 * Helpers to decide whether a key press belongs to the editor or to the
 * control that has focus. Editor-wide shortcuts (undo, delete block, pan with
 * Space) must never steal keys from the element the user is typing in or
 * operating.
 */

const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

const OPERABLE_SELECTOR = [
  TEXT_ENTRY_SELECTOR,
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="slider"]',
].join(', ');

function asElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

/** True when the key press is going into a field: typing, caret movement, selection. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return asElement(target)?.closest(TEXT_ENTRY_SELECTOR) != null;
}

/**
 * True when the focused element handles keys itself (fields, buttons, links,
 * switches). Space on these must keep its native meaning instead of starting
 * a canvas pan.
 */
export function isKeyOperableTarget(target: EventTarget | null): boolean {
  return asElement(target)?.closest(OPERABLE_SELECTOR) != null;
}

/** Elements that can take focus with the keyboard (used to take canvas content out of the tab order). */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(', ');

/**
 * Keyboard shortcuts of a focused canvas block, as keys of the `a11y` message
 * namespace. Shown in the inspector and read out as the canvas description.
 */
export const CANVAS_SHORTCUT_KEYS = [
  'shortcutNavigate',
  'shortcutSelect',
  'shortcutDeselect',
  'shortcutMove',
  'shortcutDuplicate',
  'shortcutDelete',
] as const;

/** Apple keyboards use Cmd where others use Ctrl (shortcuts and the hints that name them). */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
}

'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Destructive actions are drawn in the error colour and set apart by a divider */
  danger?: boolean;
}

interface ActionMenuProps {
  /** Accessible name of the button that opens the menu, e.g. "Opciones para Mi página" */
  label: string;
  items: ActionMenuItem[];
  /** Plain text under the items: why some actions are missing */
  note?: string;
  className?: string;
}

/** Gap between the button and the menu, and the smallest margin kept to the screen edge */
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Where the menu goes: under the button and aligned to its right edge, flipped
 * above it when it does not fit below, and shrunk (it then scrolls) when it
 * fits in neither place.
 */
function placeMenu(trigger: DOMRect, menu: { width: number; height: number }): CSSProperties {
  const below = window.innerHeight - trigger.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const above = trigger.top - MENU_GAP - VIEWPORT_MARGIN;
  const useBelow = menu.height <= below || below >= above;
  const available = Math.max(useBelow ? below : above, 0);
  const height = Math.min(menu.height, available);
  const top = useBelow ? trigger.bottom + MENU_GAP : trigger.top - MENU_GAP - height;
  const left = Math.min(
    Math.max(trigger.right - menu.width, VIEWPORT_MARGIN),
    Math.max(window.innerWidth - menu.width - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
  );
  return { top, left, maxHeight: available };
}

/**
 * A "more actions" button with a menu (WAI-ARIA menu button pattern): Enter,
 * Space or the arrow keys open it and move through the items, Escape closes it
 * and returns focus to the button, Tab closes it and moves on from the button,
 * a click anywhere else closes it.
 * Items are 44 px tall on touch screens. The menu is drawn in a portal on
 * <body> with fixed coordinates, so no ancestor (a card with rounded
 * `overflow-hidden`, a scroll area) can clip it or let a click fall through to
 * what lies below (APP2-001). Choosing an item returns focus to the button
 * first, so a dialog the item opens remembers it as its opener (APP2-003).
 */
export default function ActionMenu({ label, items, note, className }: ActionMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Which item gets focus when the menu opens: the first, or the last when it was opened with ArrowUp
  const initialFocus = useRef<'first' | 'last'>('first');

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Place the menu before it is painted, and keep it with the button while the page scrolls or resizes
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      // scrollHeight is the full content height even when maxHeight has shrunk the box; add the 1 px borders
      const height = menu.scrollHeight + (menu.offsetHeight - menu.clientHeight);
      setPosition(placeMenu(trigger.getBoundingClientRect(), { width: menu.offsetWidth, height }));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    (initialFocus.current === 'last' ? enabled[enabled.length - 1] : enabled[0])?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    enabled[(index + enabled.length) % enabled.length]?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(enabled.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        // Focus the button and let the browser's own Tab move on from it: the menu
        // unmounts with the focused item, and focus would otherwise fall to <body> (APP3-001)
        close(true);
        break;
      default:
    }
  };

  const toggle = () => {
    initialFocus.current = 'first';
    setOpen((value) => !value);
  };

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && createPortal(
        // The menu is a composite widget: key handling lives on the container, focus on the items.
        // Until the layout effect has placed it, it sits at the corner; that happens before the first paint.
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          style={position ?? { top: 0, left: 0 }}
          className="fixed z-[90] w-56 overflow-y-auto rounded-xl border border-default/30 bg-surface-elevated py-1 shadow-2xl shadow-black/40"
        >
          {items.map((item, index) => (
            <div key={item.key}>
              {item.danger && <div role="separator" className="my-1 border-t border-default/30" />}
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
                className={clsx(
                  'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:min-h-9',
                  item.danger ? 'text-error hover:bg-error/10' : 'text-secondary hover:bg-surface-card',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
          {note && (
            <p className="mt-1 border-t border-default/30 px-3 py-2 text-xs leading-relaxed text-muted">{note}</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

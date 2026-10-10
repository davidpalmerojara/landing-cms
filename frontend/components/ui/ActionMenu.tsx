'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
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

/**
 * A "more actions" button with a menu (WAI-ARIA menu button pattern): Enter,
 * Space or the arrow keys open it and move through the items, Escape closes it
 * and returns focus to the button, Tab or a click anywhere else closes it.
 * Items are 44 px tall on touch screens.
 */
export default function ActionMenu({ label, items, note, className }: ActionMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Which item gets focus when the menu opens: the first, or the last when it was opened with ArrowUp
  const initialFocus = useRef<'first' | 'last'>('first');

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    (initialFocus.current === 'last' ? enabled[enabled.length - 1] : enabled[0])?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
        close(false);
        break;
      default:
    }
  };

  const toggle = () => {
    initialFocus.current = 'first';
    setOpen((value) => !value);
  };

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
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

      {open && (
        // The menu is a composite widget: key handling lives on the container, focus on the items
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-default/30 bg-surface-elevated py-1 shadow-2xl shadow-black/40"
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
                  close(false);
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
        </div>
      )}
    </div>
  );
}

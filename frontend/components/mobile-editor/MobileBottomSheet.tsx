'use client';

import { useEffect, useId, useRef, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCloseOnBack } from '@/hooks/useCloseOnBack';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** If true, sheet takes full height minus toolbar. If false, as tall as its content (up to 85% of the screen). */
  fullHeight?: boolean;
  children: React.ReactNode;
  /** aria-label for the dialog */
  ariaLabel?: string;
  /** Text of the header button that closes the sheet ("Listo" by default) */
  closeLabel?: string;
}

/** Dragged further than this (px), the sheet closes when released */
export const SHEET_CLOSE_DISTANCE = 100;

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not([type="hidden"]), select, textarea';

/**
 * Where focus goes when the sheet opens (QA-105). With a mouse or keyboard,
 * the first field, ready to type. On a touch screen, the title: focusing a
 * field would pop the keyboard over half the sheet before the user chose
 * what to change, and screen readers start with the sheet's name.
 */
function initialFocusTarget(sheet: HTMLElement, content: HTMLElement | null, heading: HTMLElement | null): HTMLElement | null {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (!coarse) {
    const field = content?.querySelector<HTMLElement>(FIELDS);
    if (field) return field;
  }
  return heading ?? sheet.querySelector<HTMLElement>(FOCUSABLE) ?? sheet;
}

export default function MobileBottomSheet({
  open,
  onClose,
  title,
  fullHeight = true,
  children,
  ariaLabel,
  closeLabel,
}: MobileBottomSheetProps) {
  const t = useTranslations();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // The phone's back button closes the sheet instead of leaving the editor (QA-066)
  const isTopSheet = useCloseOnBack(open, onClose);

  // Focus moves into the sheet on open and back to where it was on close
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusTarget(sheetRef.current, contentRef.current, headingRef.current)?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  // Close on Escape, unless a dialog opened from the sheet is on top (it closes itself)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopSheet()) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, isTopSheet]);

  // Focus trap
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = sheet.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Swipe down to close, from the handle or the header: the sheet follows the finger (QA-065)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragOffset(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    const distance = dragOffset;
    dragStartY.current = null;
    setIsDragging(false);
    setDragOffset(0);
    if (distance > SHEET_CLOSE_DISTANCE) onClose();
  }, [dragOffset, onClose]);

  if (!open) return null;

  const dragHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  return (
    <>
      {/* Backdrop: under dialogs opened from the sheet (media library, confirmations) */}
      <div
        className="fixed inset-0 z-40 bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || t('mobile.quickEditMode')}
        tabIndex={-1}
        className={`fixed left-0 right-0 bottom-0 z-[45] bg-surface-elevated border-t border-default/15 rounded-t-2xl flex flex-col outline-none ${
          isDragging ? '' : 'transition-transform duration-300 ease-out'
        } ${fullHeight ? 'top-16' : 'max-h-[85dvh]'}`}
        // No transform at rest: a transformed sheet would trap fixed-position dialogs opened inside it
        style={{ transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined }}
      >
        <div className="touch-none shrink-0" {...dragHandlers} data-testid="sheet-drag-area">
          {/* Drag handle */}
          <div className="flex items-center justify-center min-h-6 pt-2 pb-1 cursor-grab active:cursor-grabbing" aria-hidden="true">
            <div className="w-10 h-1.5 rounded-full bg-muted/60" />
          </div>

          {/* Header */}
          {title && (
            <div className="flex items-center justify-between gap-3 px-5 pb-2 border-b border-default/15">
              <h2
                id={titleId}
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-semibold text-primary min-w-0 truncate outline-none"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold text-primary-color active:opacity-70 px-3 min-w-11 min-h-11 flex items-center -mr-2 rounded-lg shrink-0"
              >
                {closeLabel ?? t('common.done')}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </>
  );
}

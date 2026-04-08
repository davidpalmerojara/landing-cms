'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** If true, sheet takes full height minus toolbar. If false, half screen. */
  fullHeight?: boolean;
  children: React.ReactNode;
  /** aria-label for the dialog */
  ariaLabel?: string;
}

export default function MobileBottomSheet({
  open,
  onClose,
  title,
  fullHeight = true,
  children,
  ariaLabel,
}: MobileBottomSheetProps) {
  const t = useTranslations();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Focus trap: focus first focusable element on open
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
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

  // Swipe-down to close on handle area
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setTranslateY(dy);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (translateY > 120) {
      onClose();
    }
    setTranslateY(0);
  }, [translateY, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || t('mobile.quickEditMode')}
        className={`fixed left-0 right-0 bottom-0 z-[70] bg-surface-elevated border-t border-default/15 rounded-t-2xl flex flex-col transition-transform duration-300 ease-out ${
          fullHeight ? 'top-14' : 'top-[45%]'
        }`}
        style={{
          transform: `translateY(${open ? translateY : 100}%)`,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center min-h-11 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-surface-card" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-default/15">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-sm font-medium text-primary-color active:opacity-70 px-3 py-1.5 min-w-11 min-h-11 flex items-center -mr-2 rounded-lg"
            >
              {t('common.done')}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}

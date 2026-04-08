'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical, MoreVertical, ChevronUp, ChevronDown, Copy, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { blockRegistry } from '@/lib/block-registry';
import { getTranslatedBlockLabel } from '@/lib/block-i18n';
import type { Block } from '@/types/blocks';

const SWIPE_THRESHOLD = 80;
const LONG_PRESS_MS = 500;

interface MobileBlockCardProps {
  block: Block;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isPreviewExpanded: boolean;
  onTap: (blockId: string) => void;
  onLongPress: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  onMoveUp: (blockId: string) => void;
  onMoveDown: (blockId: string) => void;
  onDragHandleProps: {
    onTouchStart: (e: React.TouchEvent, index: number) => void;
  };
}

function getBlockPreview(block: Block, t: ReturnType<typeof useTranslations>): string {
  const d = block.data;
  switch (block.type) {
    case 'hero':
      return (d.title as string) || t('mobile.heroPreview');
    case 'features':
      return (d.title as string) || t('mobile.featuresPreview');
    case 'pricing': {
      const plans = [d.plan1Name, d.plan2Name].filter(Boolean);
      return plans.length > 0 ? t('mobile.pricingPreview', { count: plans.length }) : t('blocks.pricing');
    }
    case 'testimonials':
      return (d.title as string) || t('mobile.testimonialsPreview');
    case 'cta':
      return (d.title as string) || t('mobile.ctaPreview');
    case 'footer':
      return (d.brandName as string) || t('mobile.footerPreview');
    case 'faq':
      return (d.title as string) || t('mobile.faqPreview');
    case 'contact':
      return (d.title as string) || t('mobile.contactPreview');
    case 'navbar':
      return (d.brandName as string) || t('mobile.navbarPreview');
    case 'team':
      return (d.title as string) || t('mobile.teamPreview');
    case 'stats':
      return (d.title as string) || t('mobile.statsPreview');
    case 'timeline':
      return (d.title as string) || t('mobile.timelinePreview');
    case 'gallery':
      return (d.title as string) || t('mobile.galleryPreview');
    case 'logoCloud':
      return (d.title as string) || t('mobile.logoCloudPreview');
    case 'customHtml':
      return (d.html as string)?.slice(0, 40) || t('mobile.customHtmlPreview');
    default:
      return block.name || block.type;
  }
}

export default function MobileBlockCard({
  block,
  index,
  isFirst,
  isLast,
  isPreviewExpanded,
  onTap,
  onLongPress,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragHandleProps,
}: MobileBlockCardProps) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);

  // --- Swipe state ---
  const [swipeX, setSwipeX] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeRevealed, setSwipeRevealed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isSwipingRef = useRef(false);
  const directionDecidedRef = useRef(false);

  // --- Long press state ---
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const definition = blockRegistry[block.type];
  const Icon = definition?.icon;
  const label = getTranslatedBlockLabel(block.type, t, definition?.label || block.type);
  const preview = getBlockPreview(block, t);

  // --- Swipe handlers ---
  const handleCardTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle]')) return;

    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    isSwipingRef.current = false;
    directionDecidedRef.current = false;
    longPressFiredRef.current = false;

    // Start long-press timer
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress(block.id);
    }, LONG_PRESS_MS);
  }, [block.id, onLongPress]);

  const handleCardTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Cancel long press on any movement
    if (longPressTimerRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!directionDecidedRef.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        directionDecidedRef.current = true;
        isSwipingRef.current = Math.abs(dx) > Math.abs(dy);
        setIsSwiping(isSwipingRef.current);
        if (!isSwipingRef.current) return;
      } else {
        return;
      }
    }

    if (!isSwipingRef.current) return;
    if (swipeRevealed) return;

    setSwipeX(dx);
    setSwipeDirection(dx < 0 ? 'left' : 'right');
  }, [swipeRevealed]);

  const resetSwipe = useCallback(() => {
    setSwipeX(0);
    setSwipeDirection(null);
    setSwipeRevealed(false);
    setDeleteConfirm(false);
    setIsSwiping(false);
  }, []);

  const handleCardTouchEnd = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If long press fired, don't process as swipe or tap
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      isSwipingRef.current = false;
      setIsSwiping(false);
      return;
    }

    if (!isSwipingRef.current || swipeRevealed) {
      isSwipingRef.current = false;
      setIsSwiping(false);
      return;
    }

    if (Math.abs(swipeX) > SWIPE_THRESHOLD) {
      if (swipeDirection === 'left') {
        setSwipeRevealed(true);
        setDeleteConfirm(true);
        setSwipeX(-SWIPE_THRESHOLD);
      } else if (swipeDirection === 'right') {
        onDuplicate(block.id);
        resetSwipe();
      }
    } else {
      resetSwipe();
    }

    isSwipingRef.current = false;
    setIsSwiping(false);
  }, [swipeX, swipeDirection, swipeRevealed, block.id, onDuplicate, resetSwipe]);

  const handleConfirmDelete = useCallback(() => {
    onDelete(block.id);
    resetSwipe();
  }, [block.id, onDelete, resetSwipe]);

  const handleTap = useCallback(() => {
    if (isSwipingRef.current || swipeRevealed || longPressFiredRef.current) {
      if (swipeRevealed) resetSwipe();
      return;
    }
    if (!menuOpen) onTap(block.id);
  }, [menuOpen, onTap, block.id, swipeRevealed, resetSwipe]);

  const handleMenuToggle = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  }, []);

  const handleAction = useCallback(
    (action: () => void) => (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setMenuOpen(false);
      action();
    },
    [],
  );

  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1);

  // Lazy render block preview
  const PreviewComponent = isPreviewExpanded ? definition?.component : null;

  return (
    <div className="relative" role="listitem" aria-label={`${label}: ${preview}`}>
      {/* Swipe backgrounds */}
      <div className="relative overflow-hidden rounded-xl">
        {swipeDirection === 'left' && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-end pr-5 rounded-xl">
            <div className="flex items-center gap-2 text-red-400" style={{ opacity: swipeProgress }}>
              <Trash2 size={18} />
              {deleteConfirm ? (
                <button
                  onClick={handleConfirmDelete}
                  className="text-sm font-semibold text-red-400 bg-red-500/20 px-3 py-1.5 min-h-11 flex items-center rounded-lg active:bg-red-500/30"
                >
                  {t('common.done')}
                </button>
              ) : (
                <span className="text-sm font-medium">{t('common.delete')}</span>
              )}
            </div>
          </div>
        )}

        {swipeDirection === 'right' && (
          <div className="absolute inset-0 bg-primary\/10 flex items-center justify-start pl-5 rounded-xl">
            <div className="flex items-center gap-2 text-primary-color" style={{ opacity: swipeProgress }}>
              <Copy size={18} />
              <span className="text-sm font-medium">{t('common.duplicate')}</span>
            </div>
          </div>
        )}

        {/* Card foreground */}
        <div
          className="relative bg-surface-card border border-default/15 rounded-xl"
          style={{
            transform: `translateX(${swipeX}px)`,
            transition: isSwiping ? 'none' : 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onTouchStart={handleCardTouchStart}
          onTouchMove={handleCardTouchMove}
          onTouchEnd={handleCardTouchEnd}
        >
          <div
            className="flex items-center gap-3 px-3 py-3.5 active:bg-surface-card transition-colors rounded-xl"
            onClick={handleTap}
          >
            <button
              data-drag-handle
              className="touch-none shrink-0 flex items-center justify-center min-w-11 min-h-11 -ml-1 text-[#666] active:text-[#999] rounded-lg"
              aria-label={t('mobile.dragToReorder')}
              onTouchStart={(e) => onDragHandleProps.onTouchStart(e, index)}
            >
              <GripVertical size={18} />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              {Icon && (
                <div className="w-9 h-9 rounded-lg bg-surface-card flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-primary-color" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{label}</p>
                <p className="text-xs text-[#888] truncate">{preview}</p>
              </div>
            </div>

            <button
              className="shrink-0 flex items-center justify-center min-w-11 min-h-11 -mr-1 text-[#666] active:text-white rounded-lg"
              aria-label={t('dashboard.pageOptions', { name: label })}
              aria-expanded={menuOpen}
              onClick={handleMenuToggle}
            >
              <MoreVertical size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Inline preview (lazy, expanded via long press) */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: isPreviewExpanded ? 200 : 0,
          opacity: isPreviewExpanded ? 1 : 0,
        }}
      >
        {PreviewComponent && (
          <div className="mt-1 rounded-xl border border-default/15 overflow-hidden bg-white">
            <div className="pointer-events-none select-none" style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%', maxHeight: 400 }}>
              <PreviewComponent
                blockId={block.id}
                data={block.data}
                isMobile={true}
                isTablet={false}
                isPreviewMode={true}
              />
            </div>
          </div>
        )}
      </div>

      {/* Context menu dropdown */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-2 top-full mt-1 z-50 bg-surface-card border border-default\/30 rounded-xl shadow-xl py-1.5 min-w-[180px]"
            role="menu"
            aria-label={t('dashboard.pageOptions', { name: label })}
          >
            {!isFirst && (
              <button
                className="flex items-center gap-3 w-full px-4 py-2.5 min-h-11 text-sm text-secondary active:bg-[#333]"
                role="menuitem"
                onClick={handleAction(() => onMoveUp(block.id))}
              >
                <ChevronUp size={16} /> {t('editor.moveUp')}
              </button>
            )}
            {!isLast && (
              <button
                className="flex items-center gap-3 w-full px-4 py-2.5 min-h-11 text-sm text-secondary active:bg-[#333]"
                role="menuitem"
                onClick={handleAction(() => onMoveDown(block.id))}
              >
                <ChevronDown size={16} /> {t('editor.moveDown')}
              </button>
            )}
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 min-h-11 text-sm text-secondary active:bg-[#333]"
              role="menuitem"
              onClick={handleAction(() => onDuplicate(block.id))}
            >
              <Copy size={16} /> {t('common.duplicate')}
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-2.5 min-h-11 text-sm text-red-400 active:bg-[#333]"
              role="menuitem"
              onClick={handleAction(() => onDelete(block.id))}
            >
              <Trash2 size={16} /> {t('common.delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
